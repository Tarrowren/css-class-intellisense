import { SyntaxNodeRef } from "@lezer/common";
import { Range, TextDocument } from "vscode";
import { getText } from "./text-document";

export function getClassNameFromStyle(document: TextDocument, ref: SyntaxNodeRef, classNames: Map<string, Range[]>) {
  const label = getText(document, ref);
  if (label) {
    const range = new Range(document.positionAt(ref.from), document.positionAt(ref.to));
    const ranges = classNames.get(label);
    if (ranges) {
      ranges.push(range);
    } else {
      classNames.set(label, [range]);
    }
  }
}
