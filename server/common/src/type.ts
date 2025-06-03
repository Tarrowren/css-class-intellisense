import type { SyntaxNodeRef } from "@lezer/common";
import type { DocumentUri } from "vscode-languageserver";
import type { TriggeredSymbolKind } from "./features/common";

export interface SourceFile {
  refs: Set<DocumentUri>;
  class_names: Map<string, SymbolInfo>;
  id_names: Map<string, SymbolInfo>;
  used_class_names: Map<string, SymbolInfo>;
  used_id_names: Map<string, SymbolInfo>;
  suffixes: Map<number, SuffixInfo>;
}

export type SymbolInfo = SymbolRange[];

export class SymbolRange {
  private constructor(
    readonly from: number,
    readonly to: number,
    readonly suffix?: boolean,
  ) {}

  static of(from: number, to: number, suffix?: boolean) {
    return new SymbolRange(from, to, suffix);
  }

  static fromNode(node: SyntaxNodeRef, suffix?: boolean) {
    return new SymbolRange(node.from, node.to, suffix);
  }
}

export type SuffixInfo = SuffixSymbol[];

export class SuffixSymbol {
  constructor(
    readonly kind: TriggeredSymbolKind,
    readonly name: string,
  ) {}
}
