import * as LEZER_CSS from "@lezer/css";
import {
  CompletionItem,
  CompletionItemKind,
  CompletionList,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";
import { CssNodeType, LEZER_CSS_NODE_TYPES } from "../nodetype";
import { formatError, RequestService } from "../runner";
import { getFileCache, getLanguageModelCache } from "./cache";

export function getCssStore(
  requestService: RequestService,
  documents: Map<string, TextDocument>
): CssStore {
  const languageModelCache = getLanguageModelCache(10, 60, (document) => {
    return getCompletionItems(document.getText());
  });
  const fileCache = getFileCache(
    60,
    (uri) => {
      let doc: Promise<TextDocument> | TextDocument | undefined;

      const uriString = uri.toString();
      if (uri.scheme === "http" || uri.scheme === "https") {
        const result = requestService.getHttpContent(uriString);
        if (result.isDownloaded) {
          doc = result.content.then((content) => {
            return createTextDocument(uri, content);
          });
        } else {
          result.content
            .then((content) => {
              doc = createTextDocument(uri, content);
            })
            .catch((e) => {
              doc = e;
            });
        }
      } else {
        const document = documents.get(uriString);
        if (document) {
          doc = document;
        } else {
          doc = requestService.getFileContent(uri).then((content) => {
            return createTextDocument(uri, content);
          });
        }
      }

      return {
        uriString,
        get value() {
          const document = documents.get(uriString);
          if (document) {
            doc = document;
          }
          return doc;
        },
        update(document: TextDocument) {
          doc = document;
        },
      };
    },
    (uri) => {
      languageModelCache.onDocumentRemoved(uri);
    }
  );

  return {
    async getCompletionLists(uris, ref) {
      return await Promise.all(
        fileCache.getAndRecordRef(uris, ref).map(async (result) => {
          const promise = result.value;
          if (promise) {
            try {
              const document = await promise;
              return CompletionList.create(
                languageModelCache.get(document),
                false
              );
            } catch (e) {
              console.error(formatError("Open file failed", e));
              fileCache.onDocumentRemoved(result.uriString);
              return CompletionList.create(undefined, false);
            }
          } else {
            return CompletionList.create(undefined, true);
          }
        })
      );
    },
    onDocumentRemoved(document) {
      const uri = document.uri;
      switch (document.languageId) {
        case "css": {
          fileCache.get(uri)?.update(document);
          break;
        }
        case "html": {
          fileCache.onRefRemoved(uri);
          break;
        }
      }
    },
    dispose() {
      languageModelCache.dispose();
      fileCache.dispose();
    },
  };
}

export interface CssStore {
  getCompletionLists(uris: URI[], ref: string): Promise<CompletionList[]>;
  onDocumentRemoved(document: TextDocument): void;
  dispose(): void;
}

function createTextDocument(uri: URI, content: string): TextDocument {
  // TODO
  const languageId = "css";
  return TextDocument.create(uri.toString(), languageId, 0, content);
}

function getCompletionItems(content: string): CompletionItem[] {
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
