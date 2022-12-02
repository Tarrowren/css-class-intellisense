import {
  CompletionItem,
  CompletionList,
  Disposable,
  Location,
  Position,
  ProviderResult,
  Range,
  TextDocument,
  WorkspaceEdit,
} from "vscode";
import { LanguageModelCache } from "../caches/cache";
import { LanguageCacheEntry } from "../caches/language-caches";
import { ReferenceMap } from "../reference-map";
import { createCssMode } from "./css-mode";
import { createHtmlMode } from "./html-mode";
import { createLessMode } from "./less-mode";
import { createScssMode } from "./scss-mode";
import { createVueMode } from "./vue-mode";

export function createLanguageModes(
  cache: LanguageModelCache<LanguageCacheEntry>,
  referenceMap: ReferenceMap
): LanguageModes {
  const modes = new Map<string, LanguageMode>();
  modes.set("html", createHtmlMode(cache));
  modes.set("vue", createVueMode(cache));
  modes.set("css", createCssMode(cache, referenceMap));
  modes.set("less", createLessMode(cache, referenceMap));
  modes.set("scss", createScssMode(cache, referenceMap));

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
  prepareRename?: (document: TextDocument, position: Position) => ProviderResult<Range>;
  doRename?: (document: TextDocument, position: Position, newName: string) => ProviderResult<WorkspaceEdit>;
  onDocumentRemoved(document: TextDocument): void;
}
