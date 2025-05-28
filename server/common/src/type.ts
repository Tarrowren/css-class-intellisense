import type { DocumentUri } from "vscode-languageserver-textdocument";

export interface SourceFile {
  refs: Set<DocumentUri>;
  class_names: Map<string, SymbolInfo>;
  id_names: Map<string, SymbolInfo>;
  used_class_names: Map<string, SymbolInfo>;
  used_id_names: Map<string, SymbolInfo>;
}

export type SymbolInfo = SymbolRange[];

export type SymbolRange = [number, number];
