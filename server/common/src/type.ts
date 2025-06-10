import typia from "typia";
import type { TriggeredSymbolKind } from "./features/common";

export interface SourceFile {
  readonly refs: Map<string, true>;
  readonly class_names: Map<string, SymbolInfo>;
  readonly id_names: Map<string, SymbolInfo>;
  readonly suffixes: Map<number & typia.tags.Type<"uint32">, SuffixInfo>;
  readonly used_class_names: Map<string, SymbolInfo>;
  readonly used_id_names: Map<string, SymbolInfo>;
}

export interface SymbolInfo {
  readonly ranges: SymbolRange[];
  readonly suffix_ranges: (number & typia.tags.Type<"uint32">)[];
}

export interface SymbolRange {
  readonly from: number & typia.tags.Type<"uint32">;
  readonly to: number & typia.tags.Type<"uint32">;
}

export interface SuffixInfo {
  readonly to: number & typia.tags.Type<"uint32">;
  readonly full_names: Map<string, TriggeredSymbolKind>;
}
