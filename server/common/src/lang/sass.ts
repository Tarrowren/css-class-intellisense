import type { SyntaxNode, Tree } from "@lezer/common";
import type { LRParser } from "@lezer/lr";
import { parser } from "@lezer/sass";
import type { DocumentUri } from "vscode-languageserver";
import type { Configuration } from "../configuration";
import { Empty } from "../empty";
import { TriggeredSymbolKind } from "../features/common";
import type { Language } from "../languages";
import { SuffixSymbol, SymbolRange, type SourceFile, type SuffixInfo, type SymbolInfo } from "../type";
import { append, collectSymbolInfos, getNodeText } from "./common";

export default class SassLanguage implements Language {
  constructor(
    private readonly _configuration: Configuration,
    indented = false,
  ) {
    this.parser = indented ? parser.configure({ dialect: "indented" }) : parser;
  }

  readonly parser: LRParser;

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
        const info = this._getSuffixInfo(input, cursor.node, suffixes);
        if (info) {
          const range = SymbolRange.fromNode(cursor, true);
          for (const symbol of info) {
            append(symbol.kind === TriggeredSymbolKind.ClassName ? class_names : id_names, symbol.name, range);
          }
        }
      }
    } while (cursor.next());

    return {
      refs: Empty.set(),
      class_names,
      id_names,
      used_class_names: Empty.map(),
      used_id_names: Empty.map(),
      suffixes,
    };
  }

  private _getSuffixInfo(input: string, node: SyntaxNode, suffixes: Map<number, SuffixInfo>): SuffixInfo | undefined {
    const suffix = getNodeText(input, node);

    const info: SuffixInfo = [];

    let findBlockNode: SyntaxNode | null = node;
    while ((findBlockNode = findBlockNode.parent)) {
      if (!findBlockNode.type.is("Block")) {
        continue;
      }

      let findSelector: SyntaxNode | null = findBlockNode;
      while ((findSelector = findSelector.prevSibling)) {
        if (findSelector.type.is(",")) {
          continue;
        }

        let findName: SyntaxNode | null = findSelector;
        while ((findName = findName.lastChild)) {
          if (findName.type.is("ClassName")) {
            const name = getNodeText(input, findName) + suffix;
            info.push(new SuffixSymbol(TriggeredSymbolKind.ClassName, name));
            break;
          } else if (findName.type.is("IdName")) {
            const name = getNodeText(input, findName) + suffix;
            info.push(new SuffixSymbol(TriggeredSymbolKind.IdName, name));
            break;
          } else if (findName.type.is("Suffix")) {
            const parentSuffixes = suffixes.get(findName.from);
            if (parentSuffixes) {
              for (const parent of parentSuffixes) {
                info.push(new SuffixSymbol(parent.kind, parent.name + suffix));
              }
            }
            break;
          }
        }
      }

      break;
    }

    if (info.length === 0) {
      return;
    }

    suffixes.set(node.from, info);
    return info;
  }
}
