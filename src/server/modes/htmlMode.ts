import { LanguageMode } from "./languageModes";

export function getHTMLMode(): LanguageMode {
  return {
    getId() {
      return "html";
    },
    dispose() {},
  };
}
