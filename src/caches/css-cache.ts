import * as LEZER_CSS from "@lezer/css";
import { Range, TextDocument } from "vscode";
import { CSS_NODE_TYPE } from "../lezer/css";
import { getClassNameFromStyle, getIdNameFromStyle } from "../util/css-class-name";
import { LanguageCacheEntry } from "./language-caches";

export function getCssCacheEntry(document: TextDocument): LanguageCacheEntry {
  const tree = LEZER_CSS.parser.parse(document.getText());

  const classNames = new Map<string, Range[]>();
  const ids = new Map<string, Range[]>();

  tree.cursor().iterate((ref) => {
    if (ref.type === CSS_NODE_TYPE.ClassName) {
      getClassNameFromStyle(document, ref, classNames);
    } else if (ref.type === CSS_NODE_TYPE.IdName) {
      getIdNameFromStyle(document, ref, ids);
    }
  });

  return {
    tree,
    classNames,
    ids,
  };
}
