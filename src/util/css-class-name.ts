import { SyntaxNodeRef } from "@lezer/common";
import { Range, TextDocument } from "vscode";
import { isEmptyCode } from "./string";
import { getRange, getText } from "./text-document";

export function getNameFromStyle(document: TextDocument, node: SyntaxNodeRef, names: Map<string, Range[]>): void {
  const label = getText(document, node);
  if (!label) {
    return;
  }

  const range = getRange(document, node);

  const ranges = names.get(label);
  if (ranges) {
    ranges.push(range);
  } else {
    names.set(label, [range]);
  }
}

export function getNameFromAttribute(
  document: TextDocument,
  node: SyntaxNodeRef,
  names: Map<string, Range[]>,
  once: boolean = false
) {
  const value = getText(document, node);

  let start = 1;
  let end = 1;
  for (let i = 1; i < value.length; i++) {
    if (isEmptyCode(value.charCodeAt(i)) || i === value.length - 1) {
      if (start < end) {
        const name = value.substring(start, end);

        const range = new Range(document.positionAt(node.from + start), document.positionAt(node.from + end));

        const ranges = names.get(name);
        if (ranges) {
          ranges.push(range);
        } else {
          names.set(name, [range]);
        }
      }

      if (once) {
        return;
      }

      start = i + 1;
      end = start;
    } else {
      end++;
    }
  }
}
