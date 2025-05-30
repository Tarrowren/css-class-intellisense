import type { Tree } from "@lezer/common";
import { parser } from "@lezer/css";
import type { LRParser } from "@lezer/lr";
import type { DocumentUri } from "vscode-languageserver";
import type { Configuration } from "../configuration";
import { Empty } from "../empty";
import { CompletionTriggeredSymbolKind, type CompletionTriggeredSymbolInfo } from "../features/common";
import type { Language } from "../languages";
import type { SourceFile, SymbolInfo } from "../type";
import { collectSymbolInfos, getCssEditRange, isCanDoCompleteCssNode } from "./common";

export default class CssLanguage implements Language {
  constructor(private readonly _configuration: Configuration) {}

  readonly parser: LRParser = parser;

  getCompletionTriggeredSymbolInfo(_input: string, pos: number, tree: Tree): CompletionTriggeredSymbolInfo | undefined {
    const node = tree.resolve(pos);

    if (isCanDoCompleteCssNode(node, false)) {
      return { kind: CompletionTriggeredSymbolKind.Css, editRange: getCssEditRange(pos, tree, node) };
    }
  }

  query(_uri: DocumentUri, input: string, tree: Tree): SourceFile {
    const cursor = tree.cursor();

    const class_names = new Map<string, SymbolInfo>();
    const id_names = new Map<string, SymbolInfo>();

    do {
      if (cursor.type.is("ClassName")) {
        collectSymbolInfos(input, cursor, class_names);
      } else if (cursor.type.is("IdName")) {
        collectSymbolInfos(input, cursor, id_names);
      }
    } while (cursor.next());

    return {
      refs: Empty.set(),
      class_names,
      id_names,
      used_class_names: Empty.map(),
      used_id_names: Empty.map(),
    };
  }
}
