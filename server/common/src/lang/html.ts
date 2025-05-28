import { parseMixed, type SyntaxNode, type SyntaxNodeRef, type Tree } from "@lezer/common";
import * as CSS from "@lezer/css";
import * as HTML from "@lezer/html";
import type { LRParser } from "@lezer/lr";
import * as NAME from "used-name";
import { CompletionSymbolKind, type CompletionSymbolInfo } from "../features/completions";
import { DefinitionSymbolKind, type DefinitionSymbolInfo } from "../features/definitions";
import type { Language } from "../languages";
import type { SourceFile, SymbolInfo } from "../type";
import { getCssEditRange, isCanDoCompleteCssNode } from "./common";

const classNamesParser = NAME.parser.configure({ top: "UsedClassNames" });
const idNameParser = NAME.parser.configure({ top: "UsedIdName" });

export default class HtmlLanguage implements Language {
  readonly parser: LRParser = HTML.parser.configure({
    wrap: parseMixed((node, input) => {
      if (node.type.is("StyleText")) {
        return { parser: CSS.parser };
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

  getDefinitionSymbolInfo(input: string, pos: number, tree: Tree): DefinitionSymbolInfo | undefined {
    const node = tree.resolve(pos);

    if (node.type.is("UsedClassNames")) {
      let node = tree.resolve(pos, 1);
      if (!node.type.is("UsedName")) {
        node = tree.resolve(pos, -1);
        if (!node.type.is("UsedName")) {
          return;
        }
      }

      const name = nodeText(input, node);
      return { kind: DefinitionSymbolKind.Class, name };
    }

    if (node.type.is("UsedIdName")) {
      let node = tree.resolve(pos, 1);
      if (!node.type.is("UsedName")) {
        node = tree.resolve(pos, -1);
        if (!node.type.is("UsedName")) {
          return;
        }
      }

      const name = nodeText(input, node);
      return { kind: DefinitionSymbolKind.Id, name };
    }

    if (node.type.is("UsedName")) {
      const parent = node.parent;
      if (!parent) {
        return;
      }

      const name = nodeText(input, node);
      if (parent.type.is("UsedClassNames")) {
        return { kind: DefinitionSymbolKind.Class, name };
      }
      if (parent.type.is("UsedIdName")) {
        return { kind: DefinitionSymbolKind.Id, name };
      }
    }
  }

  getCompletionSymbolInfo(input: string, pos: number, tree: Tree): CompletionSymbolInfo | undefined {
    const node = tree.resolve(pos);

    if (node.type.is("UsedClassNames")) {
      return { kind: CompletionSymbolKind.Class };
    }
    if (node.type.is("UsedIdName")) {
      return { kind: CompletionSymbolKind.Id };
    }

    if (node.type.is("UsedName")) {
      const parent = node.parent;
      if (!parent) {
        return;
      }

      if (parent.type.is("UsedClassNames")) {
        return { kind: CompletionSymbolKind.Class };
      }
      if (parent.type.is("UsedIdName")) {
        return { kind: CompletionSymbolKind.Id };
      }
    }

    if (isCanDoCompleteCssNode(node, false)) {
      return { kind: CompletionSymbolKind.Css, editRange: getCssEditRange(input, pos, tree, node) };
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
      } else if (cursor.type.is("UsedClassNames")) {
        const nodes = cursor.node.getChildren("UsedName");
        for (const node of nodes) {
          collect(input, node, used_class_names);
        }
      } else if (cursor.type.is("UsedIdName")) {
        const node = cursor.node.getChild("UsedName");
        if (node) {
          collect(input, node, used_id_names);
        }
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
