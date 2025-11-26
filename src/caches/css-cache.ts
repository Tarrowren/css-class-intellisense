import { SyntaxNodeRef, Tree } from "@lezer/common";
import * as LEZER_CSS from "@lezer/css";
import { Range, TextDocument } from "vscode";
import { CSS_NODE_TYPE } from "../lezer/css";
import { addValuesCache, getNameFromStyle } from "../util/css-class-name";
import { emptyMap, emptySet } from "../util/empty";
import { LanguageCacheEntry } from "./language-caches";

export class CssCacheEntry implements LanguageCacheEntry {
  tree: Tree;
  hrefs: Set<string>;
  usedClassNames: Map<string, Range[]>;
  usedIds: Map<string, Range[]>;
  classNames: Map<string, Range[]>;
  ids: Map<string, Range[]>;
  classRules: Map<string, string>;
  idRules: Map<string, string>;

  constructor(document: TextDocument) {
    this.tree = LEZER_CSS.parser.parse(document.getText());

    this.hrefs = emptySet();
    this.usedClassNames = emptyMap();
    this.usedIds = emptyMap();
    this.classNames = new Map<string, Range[]>();
    this.ids = new Map<string, Range[]>();
    this.classRules = new Map<string, string>();
    this.idRules = new Map<string, string>();

    this.tree.cursor().iterate((ref) => {
      if (ref.type === CSS_NODE_TYPE.ClassName) {
        this.addClassNameWithRule(document, ref);
      } else if (ref.type === CSS_NODE_TYPE.IdName) {
        this.addIdWithRule(document, ref);
      }
    });
  }

  private addClassNameWithRule(document: TextDocument, node: SyntaxNodeRef) {
    // Get the class name and its range
    const range = { from: node.from, to: node.to };
    if (range.to <= range.from) {
      return;
    }

    const className = document.getText().substring(range.from, range.to);
    if (!className) {
      return;
    }

    // Get the parent RuleSet to extract the CSS rule content
    const ruleContent = this.getCssRuleContent(document, node);
    if (ruleContent) {
      this.classRules.set(className, ruleContent);
    }

    // Add to the existing classNames map for compatibility
    addValuesCache(this.classNames, className, this.getVscodeRange(document, range));
  }

  private addIdWithRule(document: TextDocument, node: SyntaxNodeRef) {
    // Get the id name and its range
    const range = { from: node.from, to: node.to };
    if (range.to <= range.from) {
      return;
    }

    const idName = document.getText().substring(range.from, range.to);
    if (!idName) {
      return;
    }

    // Get the parent RuleSet to extract the CSS rule content
    const ruleContent = this.getCssRuleContent(document, node);
    if (ruleContent) {
      this.idRules.set(idName, ruleContent);
    }

    // Add to the existing ids map for compatibility
    addValuesCache(this.ids, idName, this.getVscodeRange(document, range));
  }

  private getVscodeRange(document: TextDocument, range: { from: number; to: number }): Range {
    return new Range(document.positionAt(range.from), document.positionAt(range.to));
  }

  private getCssRuleContent(document: TextDocument, node: SyntaxNodeRef): string | null {
    // Find the parent RuleSet node
    let parentNode = node.node;
    while (parentNode && parentNode.type !== CSS_NODE_TYPE.RuleSet) {
      parentNode = parentNode.parent;
      if (!parentNode) {
        return null; // No RuleSet found
      }
    }

    if (parentNode) {
      // Extract the full rule content
      const ruleText = document.getText().substring(parentNode.from, parentNode.to);
      return ruleText.trim();
    }

    return null;
  }
}
