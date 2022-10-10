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
  const fileCache = getLanguageModelCache<CompletionItem[]>(
    10,
    60,
    (textDocument) => {
      return getCompletionItems(textDocument.getText());
    }
  );

  const httpCache = getCache(10, 60, (url) => {
    let _items: CompletionItem[] = [];
    let _isIncomplete = true;

    let resolves = new Set<() => void>();
    let rejects = new Set<(reason?: any) => void>();

    requestService
      .getHttpContent(url)
      .then((content) => {
        _items = getCompletionItems(content);
        _isIncomplete = false;
        resolves.forEach((resolve) => {
          resolve();
        });
      })
      .catch((e) => {
        httpCache.delete(url);
        rejects.forEach((reject) => {
          reject(e);
        });
      })
      .finally(() => {
        resolves.clear();
        rejects.clear();
      });

    return {
      get isIncomplete() {
        return _isIncomplete;
      },
      get items() {
        return _items;
      },
      async wait(ms: number) {
        if (!_isIncomplete) {
          return;
        }
        let timeoutId: number | NodeJS.Timeout | null | undefined = undefined;
        try {
          await new Promise<void>((resolve, reject) => {
            resolves.add(resolve);
            rejects.add(reject);

            timeoutId = setTimeout(() => {
              resolve();
              resolves.delete(resolve);
              rejects.delete(reject);
            }, ms);
          });
        } finally {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
        }
      },
    };
  });

  return {
    async getFileContent(uri: URI) {
      const u = uri.toString();

      let document = documents.get(u);
      if (!document) {
        const content = await requestService.getFileContent(uri);
        document = TextDocument.create(u, "css", 0, content);
      }

      return fileCache.get(document);
    },
    async getHttpContent(uri: URI) {
      const data = httpCache.get(uri.toString());

      await data.wait(200);

      return data;
    },
    dispose() {
      fileCache.dispose();
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
