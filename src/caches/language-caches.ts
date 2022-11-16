import { Tree } from "@lezer/common";
import { Disposable, Range, TextDocument } from "vscode";
import { RuntimeEnvironment } from "../runner";
import { createLanguageModelCache, LanguageModelCache } from "./cache";
import { getHtmlCacheEntry } from "./html-cache";
import { getVueCacheEntry } from "./vue-cache";

export function createLanguageCaches(runtime: RuntimeEnvironment): LanguageCaches {
  const caches = new Map<string, LanguageCache>();
  caches.set("html", createLanguageModelCache(runtime, 10, 60, getHtmlCacheEntry));
  caches.set("vue", createLanguageModelCache(runtime, 10, 60, getVueCacheEntry));

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

export interface LanguageCaches extends Disposable {
  getCache(languageId: string): LanguageCache | undefined;
  onDocumentRemoved(document: TextDocument): void;
}

type LanguageCache = LanguageModelCache<LanguageCacheEntry>;

export interface LanguageCacheEntry {
  readonly tree: Tree;
  readonly hrefs?: Set<string>;
  readonly usedClassNames?: Map<string, Range[]>;
  readonly classNames: Map<string, Range[]>;
}
