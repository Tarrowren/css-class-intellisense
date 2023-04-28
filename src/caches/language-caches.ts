import { Tree } from "@lezer/common";
import { Range, TextDocument } from "vscode";
import { CssCacheEntry } from "./css-cache";
import { HtmlCacheEntry } from "./html-cache";
import { JsxCacheEntry } from "./jsx-cache";
import { PhpCacheEntry } from "./php-cache";
import { VueCacheEntry } from "./vue-cache";

export function getLanguageCacheEntry(document: TextDocument): LanguageCacheEntry {
  switch (document.languageId) {
    case "html":
      return new HtmlCacheEntry(document);
    case "vue":
      return new VueCacheEntry(document);
    case "css":
    case "scss":
    case "less":
      return new CssCacheEntry(document);
    case "javascriptreact":
      return new JsxCacheEntry(document);
    case "typescriptreact":
      return new JsxCacheEntry(document, true);
    case "php":
      return new PhpCacheEntry(document);
    default:
      throw new Error("Wrong languageId");
  }
}

export interface LanguageCacheEntry {
  readonly tree: Tree;
  readonly hrefs: Set<string>;
  readonly usedClassNames: Map<string, Range[]>;
  readonly usedIds: Map<string, Range[]>;
  readonly classNames: Map<string, Range[]>;
  readonly ids: Map<string, Range[]>;
}
