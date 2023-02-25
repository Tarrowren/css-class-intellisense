import { NodeType, SyntaxNodeRef } from "@lezer/common";
import { Range, TextDocument } from "vscode";
import { CSS_NODE_TYPE } from "../lezer/css";
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

export function cssDoComplete(type: NodeType) {
  return (
    type === CSS_NODE_TYPE.StyleSheet ||
    type === CSS_NODE_TYPE.RuleSet ||
    type === CSS_NODE_TYPE.ClassSelector ||
    type === CSS_NODE_TYPE.ClassName ||
    type === CSS_NODE_TYPE.PseudoClassSelector ||
    type === CSS_NODE_TYPE.IdSelector ||
    type === CSS_NODE_TYPE.IdName ||
    type === CSS_NODE_TYPE.AttributeSelector ||
    type === CSS_NODE_TYPE.ChildSelector ||
    type === CSS_NODE_TYPE.ChildOp ||
    type === CSS_NODE_TYPE.DescendantSelector ||
    type === CSS_NODE_TYPE.SiblingSelector
  );
}
