import { TextDocument } from "vscode-languageserver-textdocument";

export function getLanguageModelCache<T>(
  maxEntries: number,
  cleanupIntervalTimeInSec: number,
  parse: (doc: TextDocument) => T
): LanguageModelCache<T> {
  const cache = new Map<
    string,
    {
      version: number;
      languageId: string;
      cTime: number;
      data: T;
    }
  >();

  let intervalId: number | NodeJS.Timeout | null | undefined;
  if (cleanupIntervalTimeInSec > 0) {
    const ms = cleanupIntervalTimeInSec * 1000;

    intervalId = setInterval(() => {
      const cutoffTime = Date.now() - ms;
      cache.forEach((v, k) => {
        if (v.cTime < cutoffTime) {
          cache.delete(k);
        }
      });
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
        let oldestTime = Number.MAX_VALUE;
        let oldestUri = null;

        cache.forEach((v, k) => {
          if (v.cTime < oldestTime) {
            oldestUri = k;
            oldestTime = v.cTime;
          }
        });

        if (oldestUri) {
          cache.delete(oldestUri);
        }
      }

      return data;
    },
    onDocumentRemoved(document) {
      cache.delete(document.uri);
    },
    dispose() {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }

      cache.clear();
    },
  };
}

export interface LanguageModelCache<T> {
  get(document: TextDocument): T;
  onDocumentRemoved(document: TextDocument): void;
  dispose(): void;
}

export function getCache<T>(
  maxEntries: number,
  cleanupIntervalTimeInSec: number,
  parse: (key: string) => T
): Cache<T> {
  const cache = new Map<string, { cTime: number; data: T }>();

  let intervalId: number | NodeJS.Timeout | null | undefined;
  if (cleanupIntervalTimeInSec > 0) {
    const ms = cleanupIntervalTimeInSec * 1000;

    intervalId = setInterval(() => {
      const cutoffTime = Date.now() - ms;
      cache.forEach((v, k) => {
        if (v.cTime < cutoffTime) {
          cache.delete(k);
        }
      });
    }, ms);
  }

  return {
    get(key) {
      const info = cache.get(key);
      if (info) {
        info.cTime = Date.now();
        return info.data;
      }

      const data = parse(key);
      cache.set(key, {
        cTime: Date.now(),
        data,
      });

      if (cache.size >= maxEntries) {
        let oldestTime = Number.MAX_VALUE;
        let oldestUri = null;

        cache.forEach((v, k) => {
          if (v.cTime < oldestTime) {
            oldestUri = k;
            oldestTime = v.cTime;
          }
        });

        if (oldestUri) {
          cache.delete(oldestUri);
        }
      }

      return data;
    },
    delete(key: string) {
      cache.delete(key);
    },
    dispose() {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }

      cache.clear();
    },
  };
}

export interface Cache<T> {
  get(key: string): T;
  delete(key: string): void;
  dispose(): void;
}
