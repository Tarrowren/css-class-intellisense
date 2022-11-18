import { LanguageModelCache } from "../caches/cache";
import { LanguageCacheEntry } from "../caches/language-caches";
import { LanguageMode } from "./language-modes";

export function createLessMode(cache: LanguageModelCache<LanguageCacheEntry>): LanguageMode {
  return {
    onDocumentRemoved(document) {},
    dispose() {},
  };
}
