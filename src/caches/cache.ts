import { Disposable, TextDocument } from "vscode";
import { RuntimeEnvironment } from "../runner";

export function createLanguageModelCache<T>(
  runtime: RuntimeEnvironment,
  maxEntries: number,
  cleanupIntervalTimeInSec: number,
  parse: (document: TextDocument) => T
): LanguageModelCache<T> {
  const cache = new Map<string, Info<T>>();

  let disposable: Disposable | null;
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
      const { version, languageId } = document;
      const uri = document.uri.toString(true);
      const info = cache.get(uri);
      if (info && info.version === version && info.languageId === languageId) {
        info.cTime = Date.now();
        return info.data;
      }

      const data = parse(document);
      cache.set(uri, { version, languageId, cTime: Date.now(), data });

      if (cache.size >= maxEntries) {
        let oldestUri: string | undefined;
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
    onDocumentRemoved(document) {
      cache.delete(document.uri.toString(true));
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

interface Info<T> {
  version: number;
  languageId: string;
  cTime: number;
  data: T;
}

export interface LanguageModelCache<T> extends Disposable {
  get(document: TextDocument): T;
  onDocumentRemoved(document: TextDocument): void;
}
