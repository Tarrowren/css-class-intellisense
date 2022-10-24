import { Disposable } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { RuntimeEnvironment } from "../runner";

export function getLanguageModelCache<T>(
  maxEntries: number,
  cleanupIntervalTimeInSec: number,
  runtime: RuntimeEnvironment,
  parse: (doc: TextDocument) => T
): LanguageModelCache<T> {
  const cache = new Map<string, LanguageModelCacheInfo<T>>();

  let disposable: Disposable | null | undefined;
  if (cleanupIntervalTimeInSec > 0) {
    const ms = cleanupIntervalTimeInSec * 1000;

    disposable = runtime.timer.setInterval(() => {
      const cutoffTime = Date.now() - ms;
      for (const [k, v] of cache) {
        if (v.cTime < cutoffTime) {
          cache.delete(k);
        }
      }
    }, ms);
  }

  return {
    get(document) {
      const { uri, version, languageId } = document;
      const info = cache.get(uri);
      if (info && info.version === version && info.languageId === languageId) {
        info.cTime = Date.now();
        return info.data;
      }

      const data = parse(document);
      cache.set(uri, {
        version,
        languageId,
        cTime: Date.now(),
        data,
      });

      if (cache.size >= maxEntries) {
        let oldestUri: string | null = null;
        let oldestTime = Number.MAX_VALUE;

        for (const [k, v] of cache) {
          if (v.cTime < oldestTime) {
            oldestUri = k;
            oldestTime = v.cTime;
          }
        }

        if (oldestUri) {
          cache.delete(oldestUri);
        }
      }

      return data;
    },
    onDocumentRemoved(uri) {
      cache.delete(uri);
    },
    dispose() {
      if (disposable) {
        disposable.dispose();
        disposable = null;
      }

      cache.clear();
    },
  };
}

interface LanguageModelCacheInfo<T> {
  version: number;
  languageId: string;
  cTime: number;
  data: T;
}

export interface LanguageModelCache<T> {
  get(document: TextDocument): T;
  onDocumentRemoved(uri: string): void;
  dispose(): void;
}
