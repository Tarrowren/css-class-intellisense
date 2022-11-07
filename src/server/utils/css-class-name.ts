import { SyntaxNodeRef } from "@lezer/common";
import { Range } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

export function getClassNameRange(document: TextDocument, ref: SyntaxNodeRef, cache: Map<string, Range[]>) {
  const label = document.getText().substring(ref.from, ref.to);
  if (label) {
    const range = Range.create(document.positionAt(ref.from - 1), document.positionAt(ref.to));
    const data = cache.get(label);
    if (data) {
      data.push(range);
    } else {
      cache.set(label, [range]);
    }
  }
}
