import { type Tree } from "@lezer/common";
import type { LRParser } from "@lezer/lr";
import type { DocumentUri } from "vscode-languageserver";
import type { Configuration } from "../configuration";
import { Empty } from "../empty";
import { CompletionTriggeredSymbolKind, type CompletionTriggeredSymbolInfo } from "../features/common";
import type { Language } from "../languages";
import type { SourceFile, SymbolInfo } from "../type";
import { resolve, textRange } from "../util";
import { collectSymbolInfos, getHrefFromImport } from "./common";
import { getJsxParser, getTsxParser } from "./parsers";

export default class JsxLanguage implements Language {
  constructor(
    private readonly _configuration: Configuration,
    ts = false,
  ) {
    this.parser = ts ? getTsxParser() : getJsxParser();
  }

  readonly parser: LRParser;

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
  }

  query(uri: DocumentUri, input: string, tree: Tree): SourceFile {
    const cursor = tree.cursor();

    const refs = new Map<string, true>();
    const used_class_names = new Map<string, SymbolInfo>();
    const used_id_names = new Map<string, SymbolInfo>();

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
      }
    } while (cursor.next());

    return {
      refs,
      class_names: Empty.map(),
      id_names: Empty.map(),
      used_class_names,
      used_id_names,
      suffixes: Empty.map(),
    };
  }
}
