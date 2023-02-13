import { SyntaxNode } from "@lezer/common";
import { Range, TextDocument } from "vscode";
import { isEmptyCode } from "./string";
import { getText } from "./text-document";

export function getIdNameFromAttribute(document: TextDocument, attrValueNode: SyntaxNode, ids: Map<string, Range[]>) {
  const value = getText(document, attrValueNode);

  let start = 1;
  let end = 1;
  for (let i = 1; i < value.length; i++) {
    if (isEmptyCode(value.charCodeAt(i)) || i === value.length - 1) {
      if (start < end) {
        const idName = value.substring(start, end);
        const range = new Range(
          document.positionAt(attrValueNode.from + start),
          document.positionAt(attrValueNode.from + end)
        );
        const ranges = ids.get(idName);
        if (ranges) {
          ranges.push(range);
        } else {
          ids.set(idName, [range]);
        }
        return;
      }
    } else {
      end++;
    }
  }
}
