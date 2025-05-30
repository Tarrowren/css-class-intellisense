import type { SyntaxNode, SyntaxNodeRef, Tree } from "@lezer/common";
import type { SymbolInfo, SymbolRange } from "../type";

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

  return nested || nonNested(node);
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

export function getCssEditRange(pos: number, tree: Tree, node: SyntaxNodeRef): SymbolRange | undefined {
  return (
    _getCssEditRange(node) ??
    _getCssEditRange(tree.resolve(pos, -1)) ??
    _getCssEditRange(tree.resolve(pos, 1)) ??
    _getCssEditRange(tree.resolve(pos + 1, 1))
  );
}

function _getCssEditRange(node: SyntaxNodeRef): SymbolRange | undefined {
  if (node.type.is("ClassName") || node.type.is("IdName")) {
    return [node.from - 1, node.to];
  }
  if (node.type.is(".") || node.type.is("#")) {
    return [node.from, node.to];
  }
}

export function collectSymbolInfos(input: string, node: SyntaxNodeRef, map: Map<string, SymbolInfo>) {
  const name = getNodeText(input, node);

  let ranges = map.get(name);
  if (!ranges) {
    ranges = [];
    map.set(name, ranges);
  }

  ranges.push([node.from, node.to]);
}

export function getNodeText(input: string, { from, to }: SyntaxNodeRef): string {
  return input.substring(from, to);
}
