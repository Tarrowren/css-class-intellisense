import {
  CompletionItem,
  CompletionList,
  Position,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { RequestService } from "../runner";
import { getCssStore } from "./cssStore";
import { getHTMLMode } from "./htmlMode";

export function getLanguageModes(
  requestService: RequestService,
  documents: Map<string, TextDocument>
): LanguageModes {
  let cssStore = getCssStore(requestService, documents);
  let modes: { [languageId: string]: LanguageMode } = {
    html: getHTMLMode(cssStore),
  };

  return {
    getMode(languageId) {
      return modes[languageId];
    },
    onDocumentRemoved(document) {
      for (const mode in modes) {
        modes[mode].onDocumentRemoved(document);
      }
    },
    dispose() {
      for (const mode in modes) {
        modes[mode].dispose();
      }
      modes = {};
      cssStore.dispose();
    },
  };
}

export interface LanguageMode {
  getId(): string;
  doComplete(
    document: TextDocument,
    position: Position
  ): Promise<CompletionList | null>;
  doResolve?: (
    document: TextDocument,
    item: CompletionItem
  ) => Promise<CompletionItem>;
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
    value &&
    typeof value.languageId === "string" &&
    typeof value.uri === "string" &&
    typeof value.offset === "number"
  );
}

export type CompletionItemData = {
  languageId: string;
  uri: string;
  offset: number;
};
