import { SyntaxNodeRef } from "@lezer/common";
import { Range, TextDocument } from "vscode";
import { isEmptyCode } from "./string";
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

export function getIdNameFromStyle(document: TextDocument, ref: SyntaxNodeRef, ids: Map<string, Range[]>) {
  const label = getText(document, ref);
  if (label) {
    const range = new Range(document.positionAt(ref.from), document.positionAt(ref.to));
    const ranges = ids.get(label);
    if (ranges) {
      ranges.push(range);
    } else {
      ids.set(label, [range]);
    }
  }
}

export function getClassNameFromAttribute(
  document: TextDocument,
  attrValueNode: SyntaxNodeRef,
  classNames: Map<string, Range[]>
) {
  const value = getText(document, attrValueNode);

  let start = 1;
  let end = 1;
  for (let i = 1; i < value.length; i++) {
    if (isEmptyCode(value.charCodeAt(i)) || i === value.length - 1) {
      if (start < end) {
        const className = value.substring(start, end);
        const range = new Range(
          document.positionAt(attrValueNode.from + start),
          document.positionAt(attrValueNode.from + end)
        );
        const ranges = classNames.get(className);
        if (ranges) {
          ranges.push(range);
        } else {
          classNames.set(className, [range]);
        }
      }

      start = i + 1;
      end = start;
    } else {
      end++;
    }
  }
}
