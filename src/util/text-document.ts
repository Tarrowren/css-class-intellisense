import { SyntaxNodeRef } from "@lezer/common";
import { Range, TextDocument } from "vscode";

export function getRange(document: TextDocument, node: SyntaxNodeRef): Range {
  return new Range(document.positionAt(node.from), document.positionAt(node.to));
}

export function getText(document: TextDocument, node: SyntaxNodeRef): string {
  return document.getText(getRange(document, node));
}

export function getRangeFromTuple(document: TextDocument, range: [number, number] | undefined): Range | undefined {
  if (!range) {
    return;
  }

  return new Range(document.positionAt(range[0]), document.positionAt(range[1]));
}
