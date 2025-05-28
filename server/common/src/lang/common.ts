import type { SyntaxNode, SyntaxNodeRef, Tree } from "@lezer/common";

export function isCanDoCompleteCssNode(node: SyntaxNode, nested: boolean): boolean {
  const type = node.type;

  if (
    !type.is("StyleSheet") &&
    !type.is("RuleSet") &&
    !type.is("ClassSelector") &&
    !type.is("ClassName") &&
    !type.is("PseudoClassSelector") &&
    !type.is("IdSelector") &&
    !type.is("IdName") &&
    !type.is("AttributeSelector") &&
    !type.is("ChildSelector") &&
    !type.is("ChildOp") &&
    !type.is("DescendantSelector") &&
    !type.is("SiblingSelector") &&
    !type.is("Block")
  ) {
    return false;
  }

  if (nested) {
    return true;
  }

  return nonNested(node);
}

function nonNested(node: SyntaxNode): boolean {
  if (node.type.is("StyleSheet")) {
    return true;
  }

  const parent = node.parent;
  if (!parent) {
    return false;
  }

  if (node.type.is("Block")) {
    return parent.type.is("MediaStatement");
  } else {
    return nonNested(parent);
  }
}

export function getCssEditRange(
  text: string,
  offset: number,
  tree: Tree,
  node: SyntaxNodeRef,
): [number, number] | undefined {
  if (node.type.is("ClassName") || node.type.is("IdName")) {
    return [node.from - 1, node.to];
  }

  const right = tree.cursorAt(offset, 1);
  if (right.type.is("ClassName") || right.type.is("IdName")) {
    return [right.from - 1, right.to];
  }

  const rightChar = text.substring(offset, offset + 1);
  const rightCursorRight = tree.cursorAt(offset + 1, 1);
  if (rightChar === ".") {
    return checkRight(text, offset, rightCursorRight, "ClassName");
  } else if (rightChar === "#") {
    return checkRight(text, offset, rightCursorRight, "IdName");
  }

  const left = tree.cursorAt(offset, -1);
  if (left.type.is("ClassName") || left.type.is("IdName")) {
    return [left.from - 1, left.to];
  }

  const leftChar = text.substring(offset - 1, offset);
  if (leftChar === "." || leftChar === "#") {
    return [offset - 1, offset];
  }
}

function checkRight(text: string, offset: number, node: SyntaxNodeRef, typeName: string): [number, number] {
  if (node.type.is(typeName)) {
    const leftChar = text.substring(offset - 1, offset);
    if (leftChar === "." || leftChar === "#") {
      return [offset - 1, offset];
    } else {
      return [node.from - 1, node.to];
    }
  } else {
    return [offset, offset + 1];
  }
}
