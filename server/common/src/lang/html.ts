import { parseMixed, type SyntaxNode, type Tree } from "@lezer/common";
import { parser as cssParser } from "@lezer/css";
import { parser as htmlParser } from "@lezer/html";
import type { LRParser } from "@lezer/lr";
import { parser as classNamesParser } from "used-name";
import type { DocumentUri } from "vscode-languageserver";
import type { Configuration } from "../configuration";
import { Empty } from "../empty";
import { CompletionTriggeredSymbolKind, type CompletionTriggeredSymbolInfo } from "../features/common";
import type { Language } from "../languages";
import type { SourceFile, SymbolInfo } from "../type";
import { textRange } from "../util";
import { collectSymbolInfos, getCssEditRange, getNodeText, isCanDoCompleteCssNode } from "./common";

const idNameParser = classNamesParser.configure({ top: "IdAttributeValue" });

export default class HtmlLanguage implements Language {
  constructor(private readonly _configuration: Configuration) {}

  readonly parser: LRParser = htmlParser.configure({
    wrap: parseMixed((node, input) => {
      if (node.type.is("StyleText")) {
        return { parser: cssParser };
      }

      if (node.type.is("AttributeValue") || node.type.is("UnquotedAttributeValue")) {
        const attr = node.node.parent;
        if (attr && attr.type.is("Attribute")) {
          const attrName = attr.getChild("AttributeName");
          if (attrName) {
            const name = input.read(attrName.from, attrName.to);
            switch (name) {
              case "class":
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

    if (isCanDoCompleteCssNode(node, false)) {
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

    do {
      if (cursor.type.is("Element")) {
        const elNode = cursor.node;
        const openTagNode = elNode.firstChild;
        if (!openTagNode) {
          continue;
        }

        const tagNameNode = openTagNode.getChild("TagName");
        if (!tagNameNode) {
          continue;
        }

        const tagName = getNodeText(input, tagNameNode);
        if (tagName !== "link") {
          continue;
        }

        for (const att of openTagNode.getChildren("Attribute")) {
          const attNameNode = att.getChild("AttributeName");
          if (!attNameNode) {
            continue;
          }
          const attName = getNodeText(input, attNameNode);
          if (attName !== "href") {
            continue;
          }

          let attValueNode: SyntaxNode | null;
          if ((attValueNode = att.getChild("AttributeValue"))) {
            const attValue = getNodeText(input, attValueNode).slice(1, -1);
            refs.set(this._configuration.resolve(uri, attValue), true);
          } else if ((attValueNode = att.getChild("UnquotedAttributeValue"))) {
            const attValue = getNodeText(input, attValueNode);
            refs.set(this._configuration.resolve(uri, attValue), true);
          }

          break;
        }
      } else if (cursor.type.is("UsedClassName")) {
        collectSymbolInfos(used_class_names, input, cursor);
      } else if (cursor.type.is("UsedIdName")) {
        collectSymbolInfos(used_id_names, input, cursor);
      } else if (cursor.type.is("ClassName")) {
        collectSymbolInfos(class_names, input, cursor);
      } else if (cursor.type.is("IdName")) {
        collectSymbolInfos(id_names, input, cursor);
      }
    } while (cursor.next());

    return {
      refs,
      class_names,
      id_names,
      used_class_names,
      used_id_names,
      suffixes: Empty.map(),
    };
  }
}
