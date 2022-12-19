import { CompletionItem, CompletionItemKind, Location, Uri, workspace } from "vscode";
import { LanguageModelCache } from "../caches/cache";
import { LanguageCacheEntry } from "../caches/language-caches";
import { Configuration } from "../config";
import { CSS_NODE_TYPE } from "../lezer/css";
import { ReferenceMap } from "../reference-map";
import { formatError, outputChannel } from "../runner";
import { getText } from "../util/text-document";
import { LanguageMode } from "./language-modes";

export function createLessMode(
  config: Configuration,
  cache: LanguageModelCache<LanguageCacheEntry>,
  referenceMap: ReferenceMap
): LanguageMode {
  return {
    async doComplete(document, position) {
      if (!config.reverseCompletion) {
        return;
      }
      const entry = cache.get(document);
      const cursor = entry.tree.cursorAt(document.offsetAt(position));

      if (
        cursor.type !== CSS_NODE_TYPE.StyleSheet &&
        cursor.type !== CSS_NODE_TYPE.RuleSet &&
        cursor.type !== CSS_NODE_TYPE.ClassSelector &&
        cursor.type !== CSS_NODE_TYPE.IdSelector &&
        cursor.type !== CSS_NODE_TYPE.Block
      ) {
        return;
      }

      const items = new Map<string, CompletionItem>();

      const refs = await referenceMap.getRefs(document.uri);
      if (refs && refs.size > 0) {
        await Promise.all(
          [...refs].map(async (ref) => {
            try {
              const uri = Uri.parse(ref);
              const document = await workspace.openTextDocument(uri);
              const entry = cache.get(document);
              entry.usedClassNames?.forEach((_, label) => {
                items.set(label, new CompletionItem("." + label, CompletionItemKind.Field));
              });
              entry.usedIds?.forEach((_, label) => {
                items.set(label, new CompletionItem("#" + label, CompletionItemKind.Field));
              });
            } catch (e) {
              outputChannel.appendLine(formatError("doComplete", e));
            }
          })
        );
      }

      return [...items.values()];
    },
    async findReferences(document, position) {
      const entry = cache.get(document);
      const cursor = entry.tree.cursorAt(document.offsetAt(position));

      if (cursor.type === CSS_NODE_TYPE.ClassName) {
        const className = getText(document, cursor);

        const references: Location[] = [];

        const refs = await referenceMap.getRefs(document.uri);
        if (refs && refs.size > 0) {
          await Promise.all(
            [...refs].map(async (ref) => {
              try {
                const uri = Uri.parse(ref);
                const document = await workspace.openTextDocument(uri);
                const entry = cache.get(document);
                const ranges = entry.usedClassNames?.get(className);
                if (ranges) {
                  for (const range of ranges) {
                    references.push(new Location(uri, range));
                  }
                }
              } catch (e) {
                outputChannel.appendLine(formatError("findReferences", e));
              }
            })
          );
        }

        return references;
      } else if (cursor.type === CSS_NODE_TYPE.IdName) {
        const idName = getText(document, cursor);

        const references: Location[] = [];

        const refs = await referenceMap.getRefs(document.uri);
        if (refs && refs.size > 0) {
          await Promise.all(
            [...refs].map(async (ref) => {
              try {
                const uri = Uri.parse(ref);
                const document = await workspace.openTextDocument(uri);
                const entry = cache.get(document);
                const ranges = entry.usedIds?.get(idName);
                if (ranges) {
                  for (const range of ranges) {
                    references.push(new Location(uri, range));
                  }
                }
              } catch (e) {
                outputChannel.appendLine(formatError("findReferences", e));
              }
            })
          );
        }

        return references;
      }
    },
    onDocumentRemoved(document) {
      cache.onDocumentRemoved(document);
    },
    dispose() {},
  };
}
