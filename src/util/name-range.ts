import { NodeType, Tree, TreeCursor } from "@lezer/common";
import { CSS_NODE_TYPE } from "../lezer/css";

export function getInsertionRange(
  text: string,
  offset: number,
  tree: Tree,
  cursor: TreeCursor
): [number, number] | undefined {
  if (cursor.type === CSS_NODE_TYPE.ClassName || cursor.type === CSS_NODE_TYPE.IdName) {
    return [cursor.from - 1, cursor.to];
  }

  const right = tree.cursorAt(offset, 1);
  if (right.type === CSS_NODE_TYPE.ClassName || right.type === CSS_NODE_TYPE.IdName) {
    return [right.from - 1, right.to];
  }

  const rightChar = text.substring(offset, offset + 1);
  const rightCursorRight = tree.cursorAt(offset + 1, 1);
  if (rightChar === ".") {
    return _test(text, offset, rightCursorRight, CSS_NODE_TYPE.ClassName);
  } else if (rightChar === "#") {
    return _test(text, offset, rightCursorRight, CSS_NODE_TYPE.IdName);
  }

  const left = tree.cursorAt(offset, -1);
  if (left.type === CSS_NODE_TYPE.ClassName || left.type === CSS_NODE_TYPE.IdName) {
    return [left.from - 1, left.to];
  }

  const leftChar = text.substring(offset - 1, offset);
  if (leftChar === "." || leftChar === "#") {
    return [offset - 1, offset];
  }
}

function _test(text: string, offset: number, cursor: TreeCursor, type: NodeType): [number, number] {
  if (cursor.type === type) {
    const leftChar = text.substring(offset - 1, offset);
    if (leftChar === "." || leftChar === "#") {
      return [offset - 1, offset];
    } else {
      return [cursor.from - 1, cursor.to];
    }
  } else {
    return [offset, offset + 1];
  }
}
