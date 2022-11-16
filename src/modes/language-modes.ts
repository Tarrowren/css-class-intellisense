import { CompletionItem, CompletionList, Disposable, Location, Position, ProviderResult, TextDocument } from "vscode";
import { LanguageCaches } from "../caches/language-caches";
import { createCssMode } from "./css-mode";
import { createHtmlMode } from "./html-mode";
import { createLessMode } from "./less-mode";
import { createScssMode } from "./scss-mode";
import { createVueMode } from "./vue-mode";

export function createLanguageModes(caches: LanguageCaches): LanguageModes {
  const modes = new Map<string, LanguageMode>();
  modes.set("html", createHtmlMode(caches));
  modes.set("vue", createVueMode(caches));
  modes.set("css", createCssMode(caches));
  modes.set("less", createLessMode(caches));
  modes.set("scss", createScssMode(caches));

  return {
    getMode(languageId) {
      return modes.get(languageId);
    },
    onDocumentRemoved(document) {
      const mode = modes.get(document.languageId);

      if (!mode) {
        return;
      }

      mode.onDocumentRemoved(document);
    },
    dispose() {
      for (const mode of modes.values()) {
        mode.dispose();
      }
      modes.clear();
    },
  };
}

export interface LanguageModes extends Disposable {
  getMode(languageId: string): LanguageMode | undefined;
  onDocumentRemoved(document: TextDocument): void;
}

export interface LanguageMode extends Disposable {
  doComplete?(document: TextDocument, position: Position): ProviderResult<CompletionItem[] | CompletionList>;
  findDefinition?(document: TextDocument, position: Position): ProviderResult<Location[]>;
  findReferences?(document: TextDocument, position: Position): ProviderResult<Location[]>;
  onDocumentRemoved(document: TextDocument): void;
}
