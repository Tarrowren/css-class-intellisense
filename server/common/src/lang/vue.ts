import { parseMixed, type Input, type NestedParse, type SyntaxNode, type Tree } from "@lezer/common";
import { parser as cssParser } from "@lezer/css";
import { parser as htmlParser } from "@lezer/html";
import { parser as jsParser } from "@lezer/javascript";
import type { LRParser } from "@lezer/lr";
import { parser as scssParser } from "@lezer/sass";
import { parser as classNamesParser } from "lezer-used-name";
import type { DocumentUri } from "vscode-languageserver";
import { CompletionTriggeredSymbolKind, type CompletionTriggeredSymbolInfo } from "../features/common";
import type { Href } from "../href";
import type { Language } from "../languages";
import type { SourceFile, SuffixInfo, SymbolInfo } from "../type";
import { textRange } from "../util";
import {
  collectSuffixInfos,
  collectSymbolInfos,
  getCssEditRange,
  getHrefFromImport,
  isCanDoCompleteCssNode,
} from "./common";

const jsxParser = jsParser.configure({ dialect: "jsx" });
const tsParser = jsParser.configure({ dialect: "ts" });
const tsxParser = jsParser.configure({ dialect: "ts jsx" });

const sassParser = scssParser.configure({ dialect: "indented" });

const idNameParser = classNamesParser.configure({ top: "IdAttributeValue" });

// TODO vue extension conflict
export default class VueLanguage implements Language {
  constructor(private readonly _href: Href) {}

  readonly parser: LRParser = htmlParser.configure({
    dialect: "selfClosing",
    wrap: parseMixed((node, input) => {
      if (node.type.is("StyleText")) {
        return _style(node.node, input);
      }

      if (node.type.is("ScriptText")) {
        return _script(node.node, input);
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

    do {
      if (cursor.type.is("ImportDeclaration")) {
        const href = getHrefFromImport(input, cursor);
        if (href) {
          const absolute_path = this._href.resolve(uri, href);
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

function _style(node: SyntaxNode, input: Input): NestedParse {
  const lang = _lang(node, input);
  switch (lang) {
    case "scss":
      return { parser: scssParser };
    case "sass":
      return { parser: sassParser };
    default:
      return { parser: cssParser };
  }
}

function _script(node: SyntaxNode, input: Input): NestedParse {
  const lang = _lang(node, input);
  switch (lang) {
    case "jsx":
      return { parser: jsxParser };
    case "ts":
      return { parser: tsParser };
    case "tsx":
      return { parser: tsxParser };
    default:
      return { parser: jsParser };
  }
}

function _lang(node: SyntaxNode, input: Input): string | undefined {
  const elNode = node.parent;
  if (!elNode) {
    return;
  }

  const openTagNode = elNode.firstChild;
  if (!openTagNode) {
    return;
  }

  for (const att of openTagNode.getChildren("Attribute")) {
    const attNameNode = att.getChild("AttributeName");
    if (!attNameNode) {
      continue;
    }

    const attName = input.read(attNameNode.from, attNameNode.to);
    if (attName !== "lang") {
      continue;
    }

    let attValueNode: SyntaxNode | null;
    if ((attValueNode = att.getChild("AttributeValue"))) {
      return input.read(attValueNode.from, attValueNode.to).slice(1, -1);
    } else if ((attValueNode = att.getChild("UnquotedAttributeValue"))) {
      return input.read(attValueNode.from, attValueNode.to);
    }

    return;
  }
}
