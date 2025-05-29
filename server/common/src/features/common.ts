import type { SymbolRange } from "../type";

export interface TriggeredSymbolInfo {
  kind: TriggeredSymbolKind;
  range: SymbolRange;
}

export enum TriggeredSymbolKind {
  ClassName,
  IdName,
}

export interface CompletionTriggeredSymbolInfo {
  kind: CompletionTriggeredSymbolKind;
  editRange?: SymbolRange;
}

export enum CompletionTriggeredSymbolKind {
  ClassName,
  IdName,
  Css,
}
