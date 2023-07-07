import { NodeType, SyntaxNode, SyntaxNodeRef, Tree } from "@lezer/common";
import * as LEZER_SASS from "@lezer/sass";
import { Range, TextDocument } from "vscode";
import { SASS_NODE_TYPE } from "../lezer/sass";
import { addValuesCache, getNameFromStyle, toNodeKey } from "../util/css-class-name";
import { emptyMap, emptySet } from "../util/empty";
import { getRange } from "../util/text-document";
import { LanguageCacheEntry } from "./language-caches";

export class SassCacheEntry implements LanguageCacheEntry {
  private suffixCache = new Map<string, SuffixCacheValue[]>();

  tree: Tree;
  hrefs: Set<string>;
  usedClassNames: Map<string, Range[]>;
  usedIds: Map<string, Range[]>;
  classNames: Map<string, Range[]>;
  ids: Map<string, Range[]>;

  constructor(document: TextDocument, indented = false) {
    this.tree = LEZER_SASS.parser.configure({ dialect: indented ? "indented" : undefined }).parse(document.getText());

    this.hrefs = emptySet();
    this.usedClassNames = emptyMap();
    this.usedIds = emptyMap();
    this.classNames = new Map<string, Range[]>();
    this.ids = new Map<string, Range[]>();

    this.tree.cursor().iterate((ref) => {
      if (ref.type === SASS_NODE_TYPE.ClassName) {
        getNameFromStyle(document, ref, this.classNames);
      } else if (ref.type === SASS_NODE_TYPE.IdName) {
        getNameFromStyle(document, ref, this.ids);
      } else if (ref.type === SASS_NODE_TYPE.Suffix) {
        this.getNameWithSuffixFromStyle(document, ref);
      }
    });
  }

  public getSuffixCacheValues(ref: SyntaxNodeRef) {
    return this.suffixCache.get(toNodeKey(ref));
  }

  private getNameWithSuffixFromStyle(document: TextDocument, ref: SyntaxNodeRef) {
    const range = getRange(document, ref);
    if (range.isEmpty) {
      return;
    }

    const suffix = document.getText(range);
    if (!suffix) {
      return;
    }

    const suffixKey = toNodeKey(ref);

    let node: SyntaxNode | null = ref.node;
    while ((node = node.parent)) {
      if (node.type === SASS_NODE_TYPE.Block) {
        while ((node = node.prevSibling)) {
          if (node.type === SASS_NODE_TYPE[","]) {
            continue;
          }

          let name: SyntaxNode | null = node;
          while ((name = name.lastChild)) {
            if (name.type === SASS_NODE_TYPE.ClassName || name.type === SASS_NODE_TYPE.IdName) {
              this.add(document, name, suffix, suffixKey, range);
              break;
            } else if (name.type === SASS_NODE_TYPE.Suffix) {
              const values = this.suffixCache.get(toNodeKey(name));
              if (!values) {
                break;
              }

              for (const value of values) {
                const label = value.name + suffix;

                if (value.type === SASS_NODE_TYPE.ClassName) {
                  addValuesCache(this.classNames, label, range);
                } else if (value.type === SASS_NODE_TYPE.IdName) {
                  addValuesCache(this.ids, label, range);
                } else {
                  break;
                }

                addValuesCache(this.suffixCache, suffixKey, { type: value.type, name: label });
              }
            }
          }
        }

        return;
      }
    }
  }

  private add(document: TextDocument, node: SyntaxNode, suffix: string, suffixKey: string, suffixRange: Range) {
    const range = getRange(document, node);
    if (range.isEmpty) {
      return;
    }

    let label = document.getText(range);
    if (!label) {
      return;
    }

    label += suffix;

    addValuesCache(node.type === SASS_NODE_TYPE.ClassName ? this.classNames : this.ids, label, suffixRange);

    addValuesCache(this.suffixCache, suffixKey, { type: node.type, name: label });
  }
}

interface SuffixCacheValue {
  type: NodeType;
  name: string;
}
