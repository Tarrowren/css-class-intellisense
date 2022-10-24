import { Tree } from "@lezer/common";
import { Range } from "vscode-languageserver-textdocument";
import { RuntimeEnvironment } from "../runner";
import { getLanguageModelCache, LanguageModelCache } from "./cache";
import { getCSSCacheEntry } from "./css-cache";
import { getHTMLCacheEntry } from "./html-cache";

export function getLanguageCaches(runtime: RuntimeEnvironment): LanguageCaches {
  const html = getLanguageModelCache(10, 60, runtime, getHTMLCacheEntry);
  const css = getLanguageModelCache(10, 60, runtime, getCSSCacheEntry);

  const caches = new Map<string, LanguageCache>();
  caches.set("html", html);
  caches.set("css", css);

  return {
    getCache(languageId) {
      return caches.get(languageId);
    },
    onDocumentRemoved(uri) {
      for (const cache of caches.values()) {
        cache.onDocumentRemoved(uri);
      }
    },
    dispose() {
      for (const cache of caches.values()) {
        cache.dispose();
      }
      caches.clear();
    },
  };
}

export interface LanguageCaches {
  getCache(languageId: string): LanguageCache | undefined;
  onDocumentRemoved(uri: string): void;
  dispose(): void;
}

export type LanguageCache = LanguageModelCache<LanguageCacheEntry>;

export interface LanguageCacheEntry {
  readonly tree: Tree;
  readonly classNameData: Map<string, Range[]>;
  readonly linkUrls?: Set<string>;
  readonly classAttributeData?: Map<string, Range[]>;
}
