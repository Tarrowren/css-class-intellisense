import { SyntaxNode, TreeCursor } from "@lezer/common";
import { CompletionItem, CompletionItemKind, Location, TextDocument, Uri, workspace, WorkspaceEdit } from "vscode";
import { LanguageModelCache } from "../caches/cache";
import { LanguageCacheEntry } from "../caches/language-caches";
import { CCI_HTTPS_SCHEME, CCI_HTTP_SCHEME } from "../http-file-system";
import { CSS_NODE_TYPE } from "../lezer/css";
import { HTML_NODE_TYPE } from "../lezer/html";
import { formatError, outputChannel } from "../runner";
import { nearbyWord, POINT } from "../util/string";
import { getText } from "../util/text-document";
import { LanguageMode } from "./language-modes";

export function createHtmlMode(cache: LanguageModelCache<LanguageCacheEntry>): LanguageMode {
  return {
    async doComplete(document, position) {
      const entry = cache.get(document);
      const cursor = entry.tree.cursorAt(document.offsetAt(position));

      const attr = isAttributeValueAndGetAttributeName(document, cursor);
      if (attr === "class") {
        const items = new Map<string, CompletionItem>();

        for (const label of entry.classNames.keys()) {
          if (!items.has(label)) {
            items.set(label, new CompletionItem(label, CompletionItemKind.Class));
          }
        }

        if (entry.hrefs && entry.hrefs.size > 0) {
          await Promise.all(
            [...entry.hrefs].map(async (href) => {
              try {
                const uri = Uri.parse(href);

                const document = await workspace.openTextDocument(uri);
                const entry = cache.get(document);

                for (const label of entry.classNames.keys()) {
                  if (!items.has(label)) {
                    items.set(label, new CompletionItem(label, CompletionItemKind.Class));
                  }
                }
              } catch (e) {
                outputChannel.appendLine(formatError("doComplete", e));
              }
            })
          );
        }

        return [...items.values()];
      } else if (attr === "id") {
        const items = new Map<string, CompletionItem>();

        for (const label of entry.ids.keys()) {
          if (!items.has(label)) {
            items.set(label, new CompletionItem(label, CompletionItemKind.Field));
          }
        }

        if (entry.hrefs && entry.hrefs.size > 0) {
          await Promise.all(
            [...entry.hrefs].map(async (href) => {
              try {
                const uri = Uri.parse(href);

                const document = await workspace.openTextDocument(uri);
                const entry = cache.get(document);

                for (const label of entry.ids.keys()) {
                  if (!items.has(label)) {
                    items.set(label, new CompletionItem(label, CompletionItemKind.Field));
                  }
                }
              } catch (e) {
                outputChannel.appendLine(formatError("doComplete", e));
              }
            })
          );
        }

        return [...items.values()];
      }
    },
    async findDefinition(document, position) {
      const entry = cache.get(document);
      const offset = document.offsetAt(position);
      const cursor = entry.tree.cursorAt(offset);

      if (!isClassAttributeValue(document, cursor)) {
        return;
      }

      const text = getText(document, cursor).slice(1, -1);
      if (!text) {
        return;
      }

      const className = nearbyWord(text, offset - cursor.from - 1);
      if (!className) {
        return;
      }

      const definition: Location[] = [];

      const ranges = entry.classNames.get(className);
      if (ranges && ranges.length > 0) {
        for (const range of ranges) {
          definition.push(new Location(document.uri, range));
        }
      }

      if (entry.hrefs && entry.hrefs.size > 0) {
        await Promise.all(
          [...entry.hrefs].map(async (href) => {
            try {
              const uri = Uri.parse(href);

              const document = await workspace.openTextDocument(uri);
              const entry = cache.get(document);

              const ranges = entry.classNames.get(className);
              if (ranges) {
                for (const range of ranges) {
                  definition.push(new Location(document.uri, range));
                }
              }
            } catch (e) {
              outputChannel.appendLine(formatError("findDefinition", e));
            }
          })
        );
      }

      return definition;
    },
    findReferences(document, position) {
      const entry = cache.get(document);
      const cursor = entry.tree.cursorAt(document.offsetAt(position));

      if (cursor.type !== CSS_NODE_TYPE.ClassName) {
        return;
      }

      const className = getText(document, cursor);

      return entry.usedClassNames?.get(className)?.map((range) => {
        return new Location(document.uri, range);
      });
    },
    async doRename(document, position, newName) {
      const entry = cache.get(document);
      const offset = document.offsetAt(position);
      const cursor = entry.tree.cursorAt(offset);

      if (isClassAttributeValue(document, cursor)) {
        const text = getText(document, cursor).slice(1, -1);
        if (!text) {
          return;
        }

        const className = nearbyWord(text, offset - cursor.from - 1);
        if (!className) {
          return;
        }

        const workspaceEdit = new WorkspaceEdit();
        entry.classNames.get(className)?.forEach((range) => {
          workspaceEdit.replace(document.uri, range, newName);
        });
        entry.usedClassNames?.get(className)?.forEach((range) => {
          workspaceEdit.replace(document.uri, range, newName);
        });

        if (entry.hrefs && entry.hrefs.size > 0) {
          await Promise.all(
            [...entry.hrefs].map(async (href) => {
              try {
                const uri = Uri.parse(href);
                if (
                  uri.scheme === CCI_HTTPS_SCHEME ||
                  uri.scheme === CCI_HTTP_SCHEME ||
                  uri.scheme === "https" ||
                  uri.scheme === "http"
                ) {
                  return;
                }

                const document = await workspace.openTextDocument(uri);
                const entry = cache.get(document);

                const ranges = entry.classNames.get(className);
                if (ranges) {
                  for (const range of ranges) {
                    workspaceEdit.replace(document.uri, range, newName);
                  }
                }
              } catch (e) {
                outputChannel.appendLine(formatError("doRename", e));
              }
            })
          );
        }

        return workspaceEdit;
      } else if (cursor.type === CSS_NODE_TYPE.ClassName) {
        if (newName.charCodeAt(0) === POINT) {
          if (newName.length <= 1) {
            return;
          }

          newName = newName.substring(1);
        }

        const className = getText(document, cursor);

        const workspaceEdit = new WorkspaceEdit();
        entry.classNames.get(className)?.forEach((range) => {
          workspaceEdit.replace(document.uri, range, newName);
        });
        entry.usedClassNames?.get(className)?.forEach((range) => {
          workspaceEdit.replace(document.uri, range, newName);
        });

        return workspaceEdit;
      }
    },
    onDocumentRemoved(document) {
      cache.onDocumentRemoved(document);
    },
    dispose() {},
  };
}

function isAttributeValueAndGetAttributeName(document: TextDocument, cursor: TreeCursor) {
  let node: SyntaxNode | null = cursor.node;
  if (
    node.type === HTML_NODE_TYPE.AttributeValue &&
    (node = node.prevSibling) &&
    node.type === HTML_NODE_TYPE.Is &&
    (node = node.prevSibling) &&
    node.type === HTML_NODE_TYPE.AttributeName
  ) {
    return getText(document, node);
  }
}

function isClassAttributeValue(document: TextDocument, cursor: TreeCursor) {
  return isAttributeValueAndGetAttributeName(document, cursor) === "class";
}
