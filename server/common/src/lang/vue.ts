import { type Tree } from "@lezer/common";
import type { LRParser } from "@lezer/lr";
import type { DocumentUri } from "vscode-languageserver";
import type { Configuration } from "../configuration";
import { CompletionTriggeredSymbolKind, type CompletionTriggeredSymbolInfo } from "../features/common";
import type { Language } from "../languages";
import type { SourceFile, SuffixInfo, SymbolInfo } from "../type";
import { resolve, textRange } from "../util";
import {
  collectSuffixInfos,
  collectSymbolInfos,
  getCssEditRange,
  getHrefFromImport,
  isCanDoCompleteCssNode,
} from "./common";
import { getVueParser } from "./parsers";

export default class VueLanguage implements Language {
  constructor(private readonly _configuration: Configuration) {}

  readonly parser: LRParser = getVueParser();

  getCompletionTriggeredSymbolInfo(_input: string, pos: number, tree: Tree): CompletionTriggeredSymbolInfo | undefined {
    const node = tree.resolve(pos);

    if (node.type.is("ClassAttributeValue")) {
      let name = tree.resolve(pos, -1);
      if (name.type.is("UsedClassName")) {
        return { kind: CompletionTriggeredSymbolKind.ClassName, editRange: textRange(name) };
      }

      name = tree.resolve(pos, 1);
      if (name.type.is("UsedClassName")) {
        return { kind: CompletionTriggeredSymbolKind.ClassName, editRange: textRange(name) };
      }

      return { kind: CompletionTriggeredSymbolKind.ClassName };
    }
    if (node.type.is("UsedClassName")) {
      return { kind: CompletionTriggeredSymbolKind.ClassName, editRange: textRange(node) };
    }
    if (node.type.is("IdAttributeValue")) {
      let name = tree.resolve(pos, -1);
      if (name.type.is("UsedIdName")) {
        return { kind: CompletionTriggeredSymbolKind.IdName, editRange: textRange(name) };
      }

      name = tree.resolve(pos, 1);
      if (name.type.is("UsedIdName")) {
        return { kind: CompletionTriggeredSymbolKind.IdName, editRange: textRange(name) };
      }

      return { kind: CompletionTriggeredSymbolKind.IdName };
    }
    if (node.type.is("UsedIdName")) {
      return { kind: CompletionTriggeredSymbolKind.IdName, editRange: textRange(node) };
    }

    if (isCanDoCompleteCssNode(node, true)) {
      return { kind: CompletionTriggeredSymbolKind.Css, editRange: getCssEditRange(pos, tree, node) };
    }
  }

  query(uri: DocumentUri, input: string, tree: Tree): SourceFile {
    const cursor = tree.cursor();

    const refs = new Map<string, true>();
    const class_names = new Map<string, SymbolInfo>();
    const id_names = new Map<string, SymbolInfo>();
    const used_class_names = new Map<string, SymbolInfo>();
    const used_id_names = new Map<string, SymbolInfo>();
    const suffixes = new Map<number, SuffixInfo>();

    const globalCSSFiles = this._configuration.global(uri);
    for (const uri of globalCSSFiles) {
      refs.set(uri, true);
    }

    do {
      if (cursor.type.is("ImportDeclaration")) {
        const href = getHrefFromImport(input, cursor);
        if (href) {
          const absolute_path = resolve(uri, href);
          if (absolute_path) {
            refs.set(absolute_path, true);
          }
        }
      } else if (cursor.type.is("UsedClassName")) {
        collectSymbolInfos(used_class_names, input, cursor);
      } else if (cursor.type.is("UsedIdName")) {
        collectSymbolInfos(used_id_names, input, cursor);
      } else if (cursor.type.is("ClassName")) {
        collectSymbolInfos(class_names, input, cursor);
      } else if (cursor.type.is("IdName")) {
        collectSymbolInfos(id_names, input, cursor);
      } else if (cursor.type.is("Suffix")) {
        collectSuffixInfos(suffixes, class_names, id_names, input, cursor.node);
      }
    } while (cursor.next());

    return {
      refs,
      class_names,
      id_names,
      used_class_names,
      used_id_names,
      suffixes,
    };
  }
}
