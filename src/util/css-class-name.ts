import { SyntaxNode, SyntaxNodeRef } from "@lezer/common";
import { Range, TextDocument } from "vscode";
import { CSS_NODE_TYPE } from "../lezer/css";
import { isEmptyCode } from "./string";
import { getRange, getText } from "./text-document";

export function addValuesCache<K, V>(cache: Map<K, V[]>, key: K, value: V) {
  const values = cache.get(key);
  if (values) {
    values.push(value);
  } else {
    cache.set(key, [value]);
  }
}

export function getNameFromStyle(document: TextDocument, node: SyntaxNodeRef, names: Map<string, Range[]>): void {
  const range = getRange(document, node);
  if (range.isEmpty) {
    return;
  }

  const label = document.getText(range);
  if (!label) {
    return;
  }

  addValuesCache(names, label, range);
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

        addValuesCache(names, name, range);
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

export function cssDoComplete(node: SyntaxNode, canNested: boolean): boolean {
  const type = node.type;

  if (
    type !== CSS_NODE_TYPE.StyleSheet &&
    type !== CSS_NODE_TYPE.RuleSet &&
    type !== CSS_NODE_TYPE.ClassSelector &&
    type !== CSS_NODE_TYPE.ClassName &&
    type !== CSS_NODE_TYPE.PseudoClassSelector &&
    type !== CSS_NODE_TYPE.IdSelector &&
    type !== CSS_NODE_TYPE.IdName &&
    type !== CSS_NODE_TYPE.AttributeSelector &&
    type !== CSS_NODE_TYPE.ChildSelector &&
    type !== CSS_NODE_TYPE.ChildOp &&
    type !== CSS_NODE_TYPE.DescendantSelector &&
    type !== CSS_NODE_TYPE.SiblingSelector &&
    type !== CSS_NODE_TYPE.Block
  ) {
    return false;
  }

  if (canNested) {
    return true;
  }

  return nonNested(node);
}

function nonNested(node: SyntaxNode): boolean {
  if (node.type === CSS_NODE_TYPE.StyleSheet) {
    return true;
  }

  const parent = node.parent;
  if (!parent) {
    return false;
  }

  if (node.type === CSS_NODE_TYPE.Block) {
    return parent.type === CSS_NODE_TYPE.MediaStatement;
  } else {
    return nonNested(parent);
  }
}
