import { parseMixed, type Tree } from "@lezer/common";
import { parser as cssParser } from "@lezer/css";
import { parser as _htmlParser } from "@lezer/html";
import type { LRParser } from "@lezer/lr";
import { parser as phpParser } from "@lezer/php";
import { parser as classNamesParser } from "lezer-used-name";
import type { DocumentUri } from "vscode-languageserver";
import { Empty } from "../empty";
import { CompletionTriggeredSymbolKind, type CompletionTriggeredSymbolInfo } from "../features/common";
import type { Href } from "../href";
import type { Language } from "../languages";
import type { SourceFile, SymbolInfo } from "../type";
import { textRange } from "../util";
import { collectSymbolInfos, getCssEditRange, getHrefFromLink, isCanDoCompleteCssNode } from "./common";

const idNameParser = classNamesParser.configure({ top: "IdAttributeValue" });
const htmlParser = _htmlParser.configure({
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

export default class PhpLanguage implements Language {
  constructor(private readonly _href: Href) {}

  readonly parser: LRParser = phpParser.configure({
    wrap: parseMixed((node) => {
      if (node.type.is("Text")) {
        return { parser: htmlParser };
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
        const href = getHrefFromLink(input, cursor);
        if (href) {
          refs.set(this._href.resolve(uri, href), true);
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
