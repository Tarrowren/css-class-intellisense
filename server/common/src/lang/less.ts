import type { Tree } from "@lezer/common";
import type { LRParser } from "@lezer/lr";
import type { DocumentUri } from "vscode-languageserver";
import type { Configuration } from "../configuration";
import { Empty } from "../empty";
import { CompletionTriggeredSymbolKind, type CompletionTriggeredSymbolInfo } from "../features/common";
import type { Language } from "../languages";
import type { SourceFile, SuffixInfo, SymbolInfo } from "../type";
import { collectSuffixInfos, collectSymbolInfos, getCssEditRange, isCanDoCompleteCssNode } from "./common";
import { getLessParser } from "./parsers";

export default class LessLanguage implements Language {
  constructor(private readonly _configuration: Configuration) {}

  readonly parser: LRParser = getLessParser();

  completion(_input: string, pos: number, tree: Tree): CompletionTriggeredSymbolInfo | undefined {
    const node = tree.resolve(pos);

    if (isCanDoCompleteCssNode(node, true)) {
      return { kind: CompletionTriggeredSymbolKind.Css, editRange: getCssEditRange(pos, tree, node) };
    }
  }

  query(_uri: DocumentUri, input: string, tree: Tree): SourceFile {
    const cursor = tree.cursor();

    const class_names = new Map<string, SymbolInfo>();
    const id_names = new Map<string, SymbolInfo>();
    const suffixes = new Map<number, SuffixInfo>();

    do {
      if (cursor.type.is("ClassName")) {
        collectSymbolInfos(class_names, input, cursor);
      } else if (cursor.type.is("IdName")) {
        collectSymbolInfos(id_names, input, cursor);
      } else if (cursor.type.is("Suffix")) {
        collectSuffixInfos(suffixes, class_names, id_names, input, cursor.node);
      }
    } while (cursor.next());

    return {
      refs: Empty.map(),
      class_names,
      id_names,
      used_class_names: Empty.map(),
      used_id_names: Empty.map(),
      suffixes,
    };
  }
}
