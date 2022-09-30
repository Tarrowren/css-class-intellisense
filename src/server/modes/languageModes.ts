import { RequestService } from "../runner";
import { getCSSMode } from "./cssMode";
import { getHTMLMode } from "./htmlMode";

export function getLanguageModes(
  requestService: RequestService
): LanguageModes {
  const modes: { [languageId: string]: LanguageMode } = {
    html: getHTMLMode(),
    css: getCSSMode(),
  };
  return {
    getMode(languageId) {
      return modes[languageId];
    },
  };
}

export interface LanguageMode {
  getId(): string;
  dispose(): void;
}

export interface LanguageModes {
  getMode(languageId: string): LanguageMode;
}
