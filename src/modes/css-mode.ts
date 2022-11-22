import { Location, Uri, workspace } from "vscode";
import { LanguageModelCache } from "../caches/cache";
import { LanguageCacheEntry } from "../caches/language-caches";
import { CSS_NODE_TYPE } from "../lezer/css";
import { ReferenceMap } from "../reference-map";
import { formatError, outputChannel } from "../runner";
import { getText } from "../util/text-document";
import { LanguageMode } from "./language-modes";

export function createCssMode(cache: LanguageModelCache<LanguageCacheEntry>, referenceMap: ReferenceMap): LanguageMode {
  return {
    async findReferences(document, position) {
      if (!referenceMap.map) {
        return;
      }

      const entry = cache.get(document);
      const cursor = entry.tree.cursorAt(document.offsetAt(position));

      if (cursor.type !== CSS_NODE_TYPE.ClassName) {
        return;
      }

      const className = getText(document, cursor);

      const references: Location[] = [];

      const refs = referenceMap.map.get(document.uri.toString(true));
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
    },
    onDocumentRemoved(document) {
      cache.onDocumentRemoved(document);
    },
    dispose() {},
  };
}
