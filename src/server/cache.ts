import { parseMixed, SyntaxNodeRef, Tree } from "@lezer/common";
import * as css from "@lezer/css";
import * as html from "@lezer/html";
import { TextDocument } from "vscode-languageserver-textdocument";
import { getHtmlNodeType, HtmlNodeTypeId } from "./type";

export function createCache(textDocument: TextDocument): Cache {
  let tree: Tree | null | undefined;

  return {
    doc: textDocument,
    get tree(): Tree {
      if (tree) {
        return tree;
      }

      return createTree(textDocument);
    },
    getText(node: SyntaxNodeRef) {
      return textDocument.getText().substring(node.from, node.to);
    },
  };
}

export interface Cache {
  doc: TextDocument;
  tree: Tree;
  getText(node: SyntaxNodeRef): string;
}

const HTML_CSS_PARSER = html.parser.configure({
  wrap: parseMixed((node) => {
    if (node.type === getHtmlNodeType(HtmlNodeTypeId.StyleText)) {
      return { parser: css.parser };
    }

    return null;
  }),
});

function createTree(textDocument: TextDocument) {
  switch (textDocument.languageId) {
    case "html":
      return HTML_CSS_PARSER.parse(textDocument.getText());
    case "css":
      return css.parser.parse(textDocument.getText());
    default:
      throw new Error("");
  }
}
