import { Tree } from "@lezer/common";
import * as LEZER_CSS from "@lezer/css";
import { Range, TextDocument } from "vscode";
import { CSS_NODE_TYPE } from "../lezer/css";
import { getClassNameFromStyle, getIdNameFromStyle } from "../util/css-class-name";
import { emptyMap, emptySet } from "../util/empty";
import { LanguageCacheEntry } from "./language-caches";

export class CssCacheEntry implements LanguageCacheEntry {
  tree: Tree;
  hrefs: Set<string>;
  usedClassNames: Map<string, Range[]>;
  usedIds: Map<string, Range[]>;
  classNames: Map<string, Range[]>;
  ids: Map<string, Range[]>;

  constructor(document: TextDocument) {
    this.tree = LEZER_CSS.parser.parse(document.getText());

    this.hrefs = emptySet();
    this.usedClassNames = emptyMap();
    this.usedIds = emptyMap();
    this.classNames = new Map<string, Range[]>();
    this.ids = new Map<string, Range[]>();

    this.tree.cursor().iterate((ref) => {
      if (ref.type === CSS_NODE_TYPE.ClassName) {
        getClassNameFromStyle(document, ref, this.classNames);
      } else if (ref.type === CSS_NODE_TYPE.IdName) {
        getIdNameFromStyle(document, ref, this.ids);
      }
    });
  }
}
