import { TextDocument } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";

export function getLanguageModelCache<T>(
  maxEntries: number,
  cleanupIntervalTimeInSec: number,
  parse: (doc: TextDocument) => T
): LanguageModelCache<T> {
  const cache = new Map<string, LanguageModelCacheInfo<T>>();

  let intervalId: number | NodeJS.Timeout | null | undefined;
  if (cleanupIntervalTimeInSec > 0) {
    const ms = cleanupIntervalTimeInSec * 1000;

    intervalId = setInterval(() => {
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
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
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

export function getFileCache<T>(
  cleanupIntervalTimeInSec: number,
  parse: (uri: URI) => T,
  onDocumentRemoved: (uri: string) => void
): FileCache<T> {
  const cache = new Map<string, FileCacheInfo<T>>();
  const refCache = new Map<string, Set<string>>();

  let intervalId: number | NodeJS.Timeout | null | undefined;
  if (cleanupIntervalTimeInSec > 0) {
    const ms = cleanupIntervalTimeInSec * 1000;

    intervalId = setInterval(() => {
      const cutoffTime = Date.now() - ms;
      for (const [k, v] of cache) {
        if (v.cTime < cutoffTime) {
          cache.delete(k);
          onDocumentRemoved(k);
        }
      }
    }, ms);
  }

  function deleteRef(uri: string, ref: string) {
    const info = cache.get(uri);
    if (info) {
      info.refs.delete(ref);
      if (info.refs.size === 0) {
        info.cTime = Date.now();
      }
    }
  }

  return {
    getAndRecordRef(uris, ref) {
      const newUris = new Set(uris.map((uri) => uri.toString()));
      const oldUris = refCache.get(ref);
      if (oldUris) {
        for (const uri of oldUris) {
          if (!newUris.has(uri)) {
            deleteRef(uri, ref);
          }
        }
      }
      refCache.set(ref, newUris);

      return uris.map((uri) => {
        const u = uri.toString();
        const info = cache.get(u);
        if (info) {
          info.cTime = Number.MAX_VALUE;
          info.refs.add(ref);
          return info.data;
        }
        const data = parse(uri);
        const refs = new Set<string>();
        refs.add(ref);
        cache.set(u, {
          cTime: Number.MAX_VALUE,
          refs,
          data,
        });
        return data;
      });
    },
    get(uri) {
      const info = cache.get(uri);
      if (info) {
        return info.data;
      }
    },
    onDocumentRemoved(uri) {
      const info = cache.get(uri);
      if (info) {
        for (const ref of info.refs) {
          const uris = refCache.get(ref);
          if (uris) {
            uris.delete(uri);
            if (uris.size === 0) {
              refCache.delete(ref);
            }
          }
        }
      }
      cache.delete(uri);
    },
    onRefRemoved(ref) {
      const uris = refCache.get(ref);

      if (uris) {
        for (const uri of uris) {
          deleteRef(uri, ref);
        }
      }

      refCache.delete(ref);
    },
    dispose() {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      cache.clear();
      refCache.clear();
    },
  };
}

interface FileCacheInfo<T> {
  cTime: number;
  refs: Set<string>;
  data: T;
}

export interface FileCache<T> {
  getAndRecordRef(uris: URI[], ref: string): T[];
  get(uri: string): T | undefined;
  onDocumentRemoved(uri: string): void;
  onRefRemoved(ref: string): void;
  dispose(): void;
}
