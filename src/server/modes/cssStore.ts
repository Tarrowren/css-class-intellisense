import * as LEZER_CSS from "@lezer/css";
import { CompletionItem, CompletionItemKind } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";
import { getCache, getLanguageModelCache } from "../cache";
import { CssNodeType, LEZER_CSS_NODE_TYPES } from "../nodetype";
import { RequestService } from "../runner";

export function getCssStore(
  requestService: RequestService,
  documents: Map<string, TextDocument>
): CssStore {
  const languageModelCache = getLanguageModelCache<CompletionItem[]>(
    10,
    60,
    (textDocument) => {
      return getCompletionItems(textDocument.getText());
    }
  );

  const httpCache = getCache(10, 60, (url) => {
    let _items: CompletionItem[] = [];
    let _isIncomplete = true;

    let _promise = requestService
      .getHttpContent(url)
      .then((content) => {
        _items = getCompletionItems(content);
        _isIncomplete = false;
      })
      .catch((e) => {
        httpCache.delete(url);
        throw e;
      });

    return {
      get value() {
        return { isIncomplete: _isIncomplete, items: _items };
      },
      async wait(ms: number) {
        if (!_isIncomplete) {
          return;
        }

        let timeoutId: number | NodeJS.Timeout | undefined;
        try {
          await Promise.race([
            _promise,
            new Promise<void>((resolve) => {
              timeoutId = setTimeout(resolve, ms);
            }),
          ]);
        } finally {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
        }
      },
    };
  });

  return {
    async getFileContent(uri) {
      const u = uri.toString();

      let document = documents.get(u);
      if (!document) {
        const content = await requestService.getFileContent(uri);
        document = TextDocument.create(u, "css", 0, content);
      }

      return languageModelCache.get(document);
    },
    async getHttpContent(uri) {
      const result = httpCache.get(uri.toString());
      await result.wait(200);
      return result.value;
    },
    dispose() {
      languageModelCache.dispose();
      httpCache.dispose();
    },
  };
}

export interface CssStore {
  getFileContent(uri: URI): Promise<CompletionItem[]>;
  getHttpContent(uri: URI): Promise<{
    readonly isIncomplete: boolean;
    readonly items: CompletionItem[];
  }>;
  dispose(): void;
}

function getCompletionItems(content: string) {
  const tree = LEZER_CSS.parser.parse(content);

  const items = new Map<string, CompletionItem>();

  tree.cursor().iterate((ref) => {
    if (ref.type === LEZER_CSS_NODE_TYPES[CssNodeType.ClassName]) {
      const label = content.substring(ref.from, ref.to);
      if (label) {
        if (items.has(label)) {
          // TODO
        } else {
          items.set(label, {
            label,
            kind: CompletionItemKind.Class,
          });
        }
      }
    }
  });

  return [...items.values()];
}
