import { SyntaxNodeRef } from "@lezer/common";
import { Range, TextDocument } from "vscode";

export function getRange(document: TextDocument, node: SyntaxNodeRef): Range {
  return new Range(document.positionAt(node.from), document.positionAt(node.to));
}

export function getText(document: TextDocument, node: SyntaxNodeRef): string {
  return document.getText(new Range(document.positionAt(node.from), document.positionAt(node.to)));
}
