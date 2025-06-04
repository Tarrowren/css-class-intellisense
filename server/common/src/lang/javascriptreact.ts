import { parseMixed, type Tree } from "@lezer/common";
import { parser } from "@lezer/javascript";
import type { LRParser } from "@lezer/lr";
import { parser as classNamesParser } from "used-name";
import type { DocumentUri } from "vscode-languageserver";
import type { Configuration } from "../configuration";
import { Empty } from "../empty";
import { CompletionTriggeredSymbolKind, type CompletionTriggeredSymbolInfo } from "../features/common";
import type { Language } from "../languages";
import { SymbolRange, type SourceFile, type SymbolInfo } from "../type";
import { collectSymbolInfos, getHrefFromImport } from "./common";

const idNameParser = classNamesParser.configure({ top: "IdAttributeValue" });

export default class JsxLanguage implements Language {
  constructor(
    private readonly _configuration: Configuration,
    ts = false,
  ) {
    this.parser = parser.configure({
      dialect: ts ? "ts jsx" : "jsx",
      wrap: parseMixed((node, input) => {
        if (node.type.is("JSXAttributeValue")) {
          const attr = node.node.parent;
          if (attr && attr.type.is("JSXAttribute")) {
            const attrName = attr.getChild("JSXIdentifier");
            if (attrName) {
              const name = input.read(attrName.from, attrName.to);
              switch (name) {
                case "class":
                case "className":
                  return { parser: classNamesParser };
                case "id":
                  return { parser: idNameParser };
                default:
                  return null;
              }
            }
          }
        }

        return null;
      }),
    });
  }

  readonly parser: LRParser;

  getCompletionTriggeredSymbolInfo(_input: string, pos: number, tree: Tree): CompletionTriggeredSymbolInfo | undefined {
    const node = tree.resolve(pos);

    if (node.type.is("ClassAttributeValue")) {
      let name = tree.resolve(pos, -1);
      if (name.type.is("UsedClassName")) {
        return { kind: CompletionTriggeredSymbolKind.ClassName, editRange: SymbolRange.fromNode(name) };
      }

      name = tree.resolve(pos, 1);
      if (name.type.is("UsedClassName")) {
        return { kind: CompletionTriggeredSymbolKind.ClassName, editRange: SymbolRange.fromNode(name) };
      }

      return { kind: CompletionTriggeredSymbolKind.ClassName };
    }
    if (node.type.is("UsedClassName")) {
      return { kind: CompletionTriggeredSymbolKind.ClassName, editRange: SymbolRange.fromNode(node) };
    }
    if (node.type.is("IdAttributeValue")) {
      let name = tree.resolve(pos, -1);
      if (name.type.is("UsedIdName")) {
        return { kind: CompletionTriggeredSymbolKind.IdName, editRange: SymbolRange.fromNode(name) };
      }

      name = tree.resolve(pos, 1);
      if (name.type.is("UsedIdName")) {
        return { kind: CompletionTriggeredSymbolKind.IdName, editRange: SymbolRange.fromNode(name) };
      }

      return { kind: CompletionTriggeredSymbolKind.IdName };
    }
    if (node.type.is("UsedIdName")) {
      return { kind: CompletionTriggeredSymbolKind.IdName, editRange: SymbolRange.fromNode(node) };
    }
  }

  query(uri: DocumentUri, input: string, tree: Tree): SourceFile {
    const cursor = tree.cursor();

    const refs = new Set<string>();
    const used_class_names = new Map<string, SymbolInfo>();
    const used_id_names = new Map<string, SymbolInfo>();

    do {
      if (cursor.type.is("ImportDeclaration")) {
        const href = getHrefFromImport(input, cursor);
        if (href) {
          refs.add(this._configuration.resolve(uri, href));
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
