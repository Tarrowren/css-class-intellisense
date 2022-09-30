import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { format } from "util";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  CompletionItem,
  CompletionItemKind,
  createConnection,
  DidChangeConfigurationNotification,
  TextDocumentSyncKind,
} from "vscode-languageserver/node";
import { Cache, createCache } from "./cache";
import { formatError, runSafe } from "./runner";
import {
  CssNodeTypeId,
  getCssNodeType,
  getHtmlNodeType,
  HtmlNodeTypeId,
} from "./type";

const connection = createConnection();

console.log = (message?: any, ...optionalParams: any[]) => {
  connection.console.log(format(message, ...optionalParams));
};
console.error = (message?: any, ...optionalParams: any[]) => {
  connection.console.error(format(message, ...optionalParams));
};

process.on("unhandledRejection", (e: any) => {
  console.error(formatError(`Unhandled exception`, e));
});

const documents = new Map<string, Cache>();

connection.onInitialize((params) => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        // resolveProvider: true,
        completionItem: {
          labelDetailsSupport: true,
        },
      },
      workspace: {
        workspaceFolders: {
          supported: !!params.capabilities.workspace?.workspaceFolders,
        },
      },
    },
  };
});

connection.onInitialized(() => {
  connection.client.register(
    DidChangeConfigurationNotification.type,
    undefined
  );
});

connection.onDidOpenTextDocument(({ textDocument }) => {
  const doc = TextDocument.create(
    textDocument.uri,
    textDocument.languageId,
    textDocument.version,
    textDocument.text
  );

  documents.set(textDocument.uri, createCache(doc));
});
connection.onDidChangeTextDocument(({ textDocument, contentChanges }) => {
  const cache = documents.get(textDocument.uri)!;

  const doc = TextDocument.update(
    cache.doc,
    contentChanges,
    textDocument.version
  );

  documents.set(textDocument.uri, createCache(doc));
});
connection.onDidCloseTextDocument(({ textDocument }) => {
  documents.delete(textDocument.uri);
});

connection.onCompletion(({ textDocument, position }, token) => {
  return runSafe(
    async () => {
      const cache = documents.get(textDocument.uri);
      if (!cache) {
        return null;
      }

      const { doc, tree } = cache;

      const cursor = tree.cursorAt(doc.offsetAt(position));

      if (
        cursor.type !== getHtmlNodeType(HtmlNodeTypeId.AttributeValue) ||
        !cursor.parent() ||
        cursor.type !== getHtmlNodeType(HtmlNodeTypeId.Attribute) ||
        !cursor.firstChild() ||
        cursor.type !== getHtmlNodeType(HtmlNodeTypeId.AttributeName) ||
        cache.getText(cursor) !== "class"
      ) {
        return null;
      }

      const items: CompletionItem[] = [];

      const links: string[] = [];

      const inline = new Set<string>();
      tree.cursor().iterate((ref) => {
        switch (ref.type) {
          case getHtmlNodeType(HtmlNodeTypeId.Element): {
            const node = ref.node;
            const tag = node.firstChild;
            if (!tag) {
              return;
            }

            const tagName = tag.getChild(HtmlNodeTypeId.TagName);
            if (!tagName || cache.getText(tagName) !== "link") {
              return;
            }

            const attr = tag
              .getChildren(HtmlNodeTypeId.Attribute)
              .find(({ firstChild }) => {
                if (
                  firstChild &&
                  firstChild.type ===
                    getHtmlNodeType(HtmlNodeTypeId.AttributeName) &&
                  cache.getText(firstChild) === "href"
                ) {
                  return true;
                } else {
                  return false;
                }
              });

            if (
              !attr ||
              !attr.lastChild ||
              attr.lastChild.type !==
                getHtmlNodeType(HtmlNodeTypeId.AttributeValue)
            ) {
              return;
            }

            const path = cache.getText(attr.lastChild).slice(1, -1);

            if (path) {
              links.push(path);
            }

            return false;
          }
          case getCssNodeType(CssNodeTypeId.ClassName):
            const label = cache.getText(ref);
            if (!inline.has(label)) {
              inline.add(label);
              items.push({
                label,
                labelDetails: {
                  detail: "(inline)",
                },
                kind: CompletionItemKind.Class,
              });
            }

            break;
          // default:
          // break;
        }
      });

      if (links.length > 0) {
        await Promise.all(
          links.map(async (path) => {
            try {
              new URL(path);
            } catch (e) {
              const uri = new URL(path, doc.uri).href;

              let cache = documents.get(uri);
              if (!cache) {
                const css = TextDocument.create(
                  uri,
                  "css",
                  0,
                  await readFile(fileURLToPath(uri), "utf8")
                );
                cache = createCache(css);
                documents.set(uri, cache);
              }

              const local = new Set<string>();
              cache.tree.cursor().iterate((ref) => {
                switch (ref.type) {
                  case getCssNodeType(CssNodeTypeId.ClassName):
                    const label = cache!.getText(ref);
                    if (!local.has(label)) {
                      local.add(label);
                      items.push({
                        label,
                        labelDetails: {
                          // detail: "(local)",
                          description: path,
                        },
                        kind: CompletionItemKind.Class,
                      });
                    }
                    break;
                }
              });
            }
          })
        );
      }

      return items;
    },
    null,
    `Error while computing completions for ${textDocument.uri}`,
    token
  );
});

connection.listen();
