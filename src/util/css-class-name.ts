import { SyntaxNodeRef, Tree } from "@lezer/common";
import { Position, Range, TextDocument } from "vscode";
import { CSS_NODE_TYPE } from "../lezer/css";
import { log } from "../runner";
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

export function getRangeOfRuleSet(document: TextDocument, position: Position, tree: Tree): Range | undefined {
  let cursor = tree.cursorAt(document.offsetAt(position), -1);

  if (cursor.type === CSS_NODE_TYPE.ClassName || cursor.type === CSS_NODE_TYPE.IdName) {
    // .tes|
    return new Range(document.positionAt(cursor.from - 1), document.positionAt(cursor.to));
  }

  if (cursor.type === CSS_NODE_TYPE.ClassSelector || cursor.type === CSS_NODE_TYPE["#"]) {
    // .test.|{}
    // .test#|{}
    return new Range(new Position(position.line, position.character - 1), position);
  }
}

export function getRangeOfClassSelector(document: TextDocument, position: Position, tree: Tree): Range | undefined {
  const right = tree.cursorAt(document.offsetAt(position), 1);
  if (right.type === CSS_NODE_TYPE.ClassName) {
    return new Range(document.positionAt(right.from - 1), document.positionAt(right.to));
  }

  if (right.type === CSS_NODE_TYPE.ClassSelector) {
    const left = tree.cursorAt(document.offsetAt(position), -1);
    if (left.type === CSS_NODE_TYPE.ClassSelector) {
      return new Range(new Position(position.line, position.character - 1), position);
    }

    // .test|.
    return new Range(position, new Position(position.line, position.character + 1));
  }
}

export function getRangeOfIdSelector(document: TextDocument, position: Position, tree: Tree): Range | undefined {
  const right = tree.cursorAt(document.offsetAt(position), 1);
  if (right.type === CSS_NODE_TYPE.IdName) {
    return new Range(document.positionAt(right.from - 1), document.positionAt(right.to));
  }

  if (right.type === CSS_NODE_TYPE.IdSelector) {
    const left = tree.cursorAt(document.offsetAt(position), -1);
    if (left.type === CSS_NODE_TYPE["#"]) {
      return new Range(new Position(position.line, position.character - 1), position);
    }
  }

  // left.type === CSS_NODE_TYPE["#"] &&

  //  log.info("id: %o %o,%o", left.type.id, left.type.name, right.type.name);
  return;
}
