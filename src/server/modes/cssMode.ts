import { LanguageMode } from "./languageModes";

export function getCSSMode(): LanguageMode {
  return {
    getId() {
      return "css";
    },
    dispose() {},
  };
}
