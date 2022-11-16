import { LanguageCaches } from "../caches/language-caches";
import { LanguageMode } from "./language-modes";

export function createScssMode(caches: LanguageCaches): LanguageMode {
  return {
    onDocumentRemoved(document) {},
    dispose() {},
  };
}
