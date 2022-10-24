import { CompletionItem, CompletionList, Definition, Location, Position } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { getLanguageCaches } from "../caches/language-caches";
import { DocumentStore } from "../document/store";
import { RuntimeEnvironment } from "../runner";
import { getCSSMode } from "./css-mode";
import { getHTMLMode } from "./html-mode";

export function getLanguageModes(runtime: RuntimeEnvironment, store: DocumentStore): LanguageModes {
  const cache = getLanguageCaches(runtime);

  store.addEventListener((uri) => {
    cache.onDocumentRemoved(uri);
  });

  const html = getHTMLMode(store, cache);
  const css = getCSSMode(store, cache);

  const modes = new Map<string, LanguageMode>();
  modes.set(html.getId(), html);
  modes.set(css.getId(), css);

  return {
    getMode(languageId) {
      return modes.get(languageId);
    },
    onDocumentRemoved(document) {
      for (const mode of modes.values()) {
        mode.onDocumentRemoved(document);
      }
    },
    dispose() {
      cache.dispose();
      for (const mode of modes.values()) {
        mode.dispose();
      }
      modes.clear();
    },
  };
}

export interface LanguageMode {
  getId(): string;
  doComplete?(document: TextDocument, position: Position): Promise<CompletionList | null>;
  doResolve?(document: TextDocument, item: CompletionItem): Promise<CompletionItem>;
  findDefinition?(document: TextDocument, position: Position): Promise<Definition | null>;
  findReferences?: (document: TextDocument, position: Position) => Promise<Location[] | null>;
  onDocumentRemoved(document: TextDocument): void;
  dispose(): void;
}

export interface LanguageModes {
  getMode(languageId: string): LanguageMode | undefined;
  onDocumentRemoved(document: TextDocument): void;
  dispose(): void;
}

export function isCompletionItemData(value: any): value is CompletionItemData {
  return (
    value && typeof value.languageId === "string" && typeof value.uri === "string" && typeof value.offset === "number"
  );
}

export type CompletionItemData = {
  languageId: string;
  uri: string;
  offset: number;
};
