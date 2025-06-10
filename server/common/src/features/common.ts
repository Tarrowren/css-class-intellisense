import type { SymbolRange } from "../type";

export interface TriggeredSymbolInfo {
  kind: TriggeredSymbolKind;
  range: SymbolRange;
}

export enum TriggeredSymbolKind {
  ClassName = 1 << 0,
  IdName = 1 << 1,
}

export interface CompletionTriggeredSymbolInfo {
  kind: CompletionTriggeredSymbolKind;
  editRange?: SymbolRange;
}

export enum CompletionTriggeredSymbolKind {
  ClassName = 1 << 0,
  IdName = 1 << 1,
  Css = 1 << 2,
}
