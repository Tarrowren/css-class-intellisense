import { LanguageCaches } from "../caches/language-caches";
import { LanguageMode } from "./language-modes";

export function createLessMode(caches: LanguageCaches): LanguageMode {
  return {
    onDocumentRemoved(document) {},
    dispose() {},
  };
}
