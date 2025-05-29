import { parseMixed, type SyntaxNode, type SyntaxNodeRef, type Tree } from "@lezer/common";
import { parser as cssParser } from "@lezer/css";
import { parser as htmlParser } from "@lezer/html";
import type { LRParser } from "@lezer/lr";
import { parser as classNamesParser } from "used-name";
import { CompletionTriggeredSymbolKind, type CompletionTriggeredSymbolInfo } from "../features/common";
import type { Language } from "../languages";
import type { SourceFile, SymbolInfo } from "../type";
import { getCssEditRange, isCanDoCompleteCssNode } from "./common";

const idNameParser = classNamesParser.configure({ top: "IdAttributeValue" });

export default class HtmlLanguage implements Language {
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

    if (node.type.is("ClassAttributeValue") || node.type.is("UsedClassName")) {
      return { kind: CompletionTriggeredSymbolKind.ClassName };
    }
    if (node.type.is("IdAttributeValue") || node.type.is("UsedIdName")) {
      return { kind: CompletionTriggeredSymbolKind.IdName };
    }

    if (isCanDoCompleteCssNode(node, false)) {
      return { kind: CompletionTriggeredSymbolKind.Css, editRange: getCssEditRange(pos, tree, node) };
    }
  }

  query(input: string, tree: Tree): SourceFile {
    const cursor = tree.cursor();

    const refs = new Set<string>();
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

        const tagName = nodeText(input, tagNameNode);
        if (tagName !== "link") {
          continue;
        }

        for (const att of openTagNode.getChildren("Attribute")) {
          const attNameNode = att.getChild("AttributeName");
          if (!attNameNode) {
            continue;
          }
          const attName = nodeText(input, attNameNode);
          if (attName !== "href") {
            continue;
          }

          // TODO
          let attValueNode: SyntaxNode | null;
          if ((attValueNode = att.getChild("AttributeValue"))) {
            const attValue = nodeText(input, attValueNode);
            logger.info("AttributeValue href " + attValue);
          } else if ((attValueNode = att.getChild("UnquotedAttributeValue"))) {
            const attValue = nodeText(input, attValueNode);
            logger.info("UnquotedAttributeValue href " + attValue);
          } else {
            continue;
          }

          break;
        }
      } else if (cursor.type.is("UsedClassName")) {
        collect(input, cursor, used_class_names);
      } else if (cursor.type.is("UsedIdName")) {
        collect(input, cursor, used_id_names);
      } else if (cursor.type.is("ClassName")) {
        collect(input, cursor, class_names);
      } else if (cursor.type.is("IdName")) {
        collect(input, cursor, id_names);
      }
    } while (cursor.next());

    return {
      refs,
      class_names,
      id_names,
      used_class_names,
      used_id_names,
    };
  }
}

function collect(input: string, node: SyntaxNodeRef, map: Map<string, SymbolInfo>) {
  const name = nodeText(input, node);

  let ranges = map.get(name);
  if (!ranges) {
    ranges = [];
    map.set(name, ranges);
  }

  ranges.push([node.from, node.to]);
}

function nodeText(input: string, { from, to }: SyntaxNodeRef): string {
  return input.substring(from, to);
}
