import type { SyntaxNode, SyntaxNodeRef, Tree } from "@lezer/common";
import { TriggeredSymbolKind } from "../features/common";
import { SuffixSymbol, SymbolRange, type SuffixInfo, type SymbolInfo } from "../type";

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
    return SymbolRange.of(node.from - 1, node.to);
  }
  if (node.type.is(".") || node.type.is("#")) {
    const nextSibling = node.node.nextSibling;
    if (nextSibling && (nextSibling.type.is("ClassName") || nextSibling.type.is("IdName"))) {
      return SymbolRange.of(nextSibling.from - 1, nextSibling.to);
    } else {
      return SymbolRange.fromNode(node);
    }
  }
}

export function append<K, V>(data: Map<K, V[]>, key: K, value: V): void {
  const values = data.get(key);
  if (values) {
    values.push(value);
  } else {
    data.set(key, [value]);
  }
}

export function collectSymbolInfos(data: Map<string, SymbolInfo>, input: string, node: SyntaxNodeRef): void {
  append(data, getNodeText(input, node), SymbolRange.fromNode(node));
}

export function getNodeText(input: string, { from, to }: SyntaxNodeRef): string {
  return input.substring(from, to);
}

export function collectSuffixInfos(
  suffixes: Map<number, SuffixInfo>,
  class_names: Map<string, SymbolInfo>,
  id_names: Map<string, SymbolInfo>,
  input: string,
  node: SyntaxNode,
): void {
  const suffix = getNodeText(input, node);

  const info: SuffixSymbol[] = [];

  let findBlockNode: SyntaxNode | null = node;
  while ((findBlockNode = findBlockNode.parent)) {
    if (!findBlockNode.type.is("Block")) {
      continue;
    }

    let findSelector: SyntaxNode | null = findBlockNode;
    while ((findSelector = findSelector.prevSibling)) {
      if (findSelector.type.is(",")) {
        continue;
      }

      let findName: SyntaxNode | null = findSelector;
      while ((findName = findName.lastChild)) {
        if (findName.type.is("ClassName")) {
          const name = getNodeText(input, findName) + suffix;
          info.push(new SuffixSymbol(TriggeredSymbolKind.ClassName, name));
          break;
        } else if (findName.type.is("IdName")) {
          const name = getNodeText(input, findName) + suffix;
          info.push(new SuffixSymbol(TriggeredSymbolKind.IdName, name));
          break;
        } else if (findName.type.is("Suffix")) {
          const parentSuffixes = suffixes.get(findName.from);
          if (parentSuffixes) {
            for (const parent of parentSuffixes) {
              info.push(new SuffixSymbol(parent.kind, parent.name + suffix));
            }
          }
          break;
        }
      }
    }

    break;
  }

  if (info.length === 0) {
    return;
  }

  suffixes.set(node.from, info);

  const range = SymbolRange.fromNode(node, true);
  for (const symbol of info) {
    append(symbol.kind === TriggeredSymbolKind.ClassName ? class_names : id_names, symbol.name, range);
  }
}
