import { Tree } from "@lezer/common";
import { Range, TextDocument } from "vscode";
import { getCssCacheEntry } from "./css-cache";
import { getHtmlCacheEntry } from "./html-cache";
import { getVueCacheEntry } from "./vue-cache";

export function getLanguageCacheEntry(document: TextDocument): LanguageCacheEntry {
  switch (document.languageId) {
    case "html":
      return getHtmlCacheEntry(document);
    case "vue":
      return getVueCacheEntry(document);
    case "css":
    case "scss":
    case "less":
      return getCssCacheEntry(document);
    default:
      throw new Error("Wrong languageId");
  }
}

export interface LanguageCacheEntry {
  readonly tree: Tree;
  readonly hrefs?: Set<string>;
  readonly usedClassNames?: Map<string, Range[]>;
  readonly classNames: Map<string, Range[]>;
}
