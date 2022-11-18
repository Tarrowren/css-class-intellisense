import { LanguageModelCache } from "../caches/cache";
import { LanguageCacheEntry } from "../caches/language-caches";
import { CSS_NODE_TYPE } from "../lezer/css";
import { getText } from "../util/text-document";
import { LanguageMode } from "./language-modes";

export function createCssMode(cache: LanguageModelCache<LanguageCacheEntry>): LanguageMode {
  return {
    findReferences(document, position) {
      const entry = cache.get(document);
      const cursor = entry.tree.cursorAt(document.offsetAt(position));

      if (cursor.type !== CSS_NODE_TYPE.ClassName) {
        return;
      }

      const className = getText(document, cursor);

      return [];
    },
    onDocumentRemoved(document) {},
    dispose() {},
  };
}
