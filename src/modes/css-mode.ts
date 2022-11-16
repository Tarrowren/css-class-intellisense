import { LanguageCaches } from "../caches/language-caches";
import { LanguageMode } from "./language-modes";

export function createCssMode(caches: LanguageCaches): LanguageMode {
  return {
    onDocumentRemoved(document) {},
    dispose() {},
  };
}
