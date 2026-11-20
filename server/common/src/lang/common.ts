import type { SyntaxNode, SyntaxNodeRef, Tree } from "@lezer/common";
import { TriggeredSymbolKind } from "../features/common";
import type { SuffixInfo, SymbolInfo, SymbolRange } from "../type";
import { textRange } from "../util";

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
    return { from: node.from - 1, to: node.to };
  }
  if (node.type.is(".") || node.type.is("#")) {
    const nextSibling = node.node.nextSibling;
    if (nextSibling && (nextSibling.type.is("ClassName") || nextSibling.type.is("IdName"))) {
      return { from: nextSibling.from - 1, to: nextSibling.to };
    } else {
      return textRange(node);
    }
  }
}

export function collectSymbolInfos(data: Map<string, SymbolInfo>, input: string, node: SyntaxNodeRef): void {
  const name = getNodeText(input, node);

  const info = data.get(name);
  if (info) {
    info.ranges.push(textRange(node));
  } else {
    data.set(name, { ranges: [textRange(node)], suffix_ranges: [] });
  }
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
  const suffixName = getNodeText(input, node);

  const full_names = new Map<string, TriggeredSymbolKind>();

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
          const name = getNodeText(input, findName) + suffixName;
          const kinds = full_names.get(name) ?? 0;
          full_names.set(name, kinds | TriggeredSymbolKind.ClassName);
          break;
        } else if (findName.type.is("IdName")) {
          const name = getNodeText(input, findName) + suffixName;
          const kinds = full_names.get(name) ?? 0;
          full_names.set(name, kinds | TriggeredSymbolKind.IdName);
          break;
        } else if (findName.type.is("Suffix")) {
          const suffixInfo = suffixes.get(findName.from);
          if (suffixInfo) {
            for (const [parentName, parentKinds] of suffixInfo.full_names) {
              const name = parentName + suffixName;
              const kinds = full_names.get(name) ?? 0;
              full_names.set(name, kinds | parentKinds);
            }
          }
          break;
        }
      }
    }

    break;
  }

  if (full_names.size === 0) {
    return;
  }

  suffixes.set(node.from, { to: node.to, full_names });

  for (const [name, kinds] of full_names) {
    if (kinds & TriggeredSymbolKind.ClassName) {
      const info = class_names.get(name);

      if (info) {
        info.suffix_ranges.push(node.from);
      } else {
        class_names.set(name, { ranges: [], suffix_ranges: [node.from] });
      }
    }

    if (kinds & TriggeredSymbolKind.IdName) {
      const info = id_names.get(name);

      if (info) {
        info.suffix_ranges.push(node.from);
      } else {
        id_names.set(name, { ranges: [], suffix_ranges: [node.from] });
      }
    }
  }
}

export function getHrefFromLink(input: string, node: SyntaxNodeRef): string | undefined {
  const elNode = node.node;
  const openTagNode = elNode.firstChild;
  if (!openTagNode) {
    return;
  }

  const tagNameNode = openTagNode.getChild("TagName");
  if (!tagNameNode) {
    return;
  }

  const tagName = getNodeText(input, tagNameNode);
  if (tagName !== "link") {
    return;
  }

  for (const att of openTagNode.getChildren("Attribute")) {
    const attNameNode = att.getChild("AttributeName");
    if (!attNameNode) {
      continue;
    }
    const attName = getNodeText(input, attNameNode);
    if (attName !== "href") {
      continue;
    }

    let attValueNode: SyntaxNode | null;
    if ((attValueNode = att.getChild("AttributeValue"))) {
      return _checkHref(getNodeText(input, attValueNode).slice(1, -1));
    } else if ((attValueNode = att.getChild("UnquotedAttributeValue"))) {
      return _checkHref(getNodeText(input, attValueNode));
    }

    return;
  }
}

export function getHrefFromImport(input: string, node: SyntaxNodeRef): string | undefined {
  const str = node.node.getChild("String");
  if (!str) {
    return;
  }

  return _checkHref(getNodeText(input, str).slice(1, -1));
}

function _checkHref(href: string | undefined) {
  if (href && /(?<!\.module)\.(?:c|sc|sa|le)ss/.test(href)) {
    return href;
  }

  return;
}
