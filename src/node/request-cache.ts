import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Memento } from "vscode";

interface CacheEntry {
  etag: string;
  fileName: string;
  updateTime: number;
}

type CacheInfo = Record<string, CacheEntry>;

const MEMENTO_KEY = "request-cache";

export async function createRequestCache(globalStoragePath: string, globalState: Memento): Promise<RequestCache> {
  const cacheLocation = join(globalStoragePath, MEMENTO_KEY);
  await mkdir(cacheLocation, { recursive: true });

  const infos = globalState.get<CacheInfo>(MEMENTO_KEY, {});
  const validated: CacheInfo = {};
  for (const uri in infos) {
    const { etag, fileName, updateTime } = infos[uri];
    if (typeof etag === "string" && typeof fileName === "string" && typeof updateTime === "number") {
      validated[uri] = { etag, fileName, updateTime };
    }
  }

  let cacheInfo = validated;

  async function loadFile(uri: string, cacheEntry: CacheEntry, isUpdated: boolean): Promise<Uint8Array | undefined> {
    try {
      const content = await readFile(join(cacheLocation, cacheEntry.fileName));
      if (isUpdated) {
        cacheEntry.updateTime = Date.now();
        await updateMemento();
      }
      return content;
    } catch (e) {
      delete cacheInfo[uri];
      await updateMemento();
    }
  }

  async function deleteFile(uri: string, cacheEntry: CacheEntry): Promise<void> {
    delete cacheInfo[uri];
    await updateMemento();
    try {
      await rm(join(cacheLocation, cacheEntry.fileName));
    } catch (e) {
      // ignore
    }
  }

  async function updateMemento(): Promise<void> {
    try {
      await globalState.update(MEMENTO_KEY, cacheInfo);
    } catch (e) {
      // ignore
    }
  }

  return {
    async clearCache() {
      const uris = Object.keys(cacheInfo);
      try {
        const files = await readdir(cacheLocation);
        for (const file of files) {
          try {
            await unlink(join(cacheLocation, file));
          } catch (_e) {
            // ignore
          }
        }
      } catch (e) {
        // ignore
      } finally {
        cacheInfo = {};
        await updateMemento();
      }
      return uris;
    },
    async get(uri, etag, etagValid) {
      const cacheEntry = cacheInfo[uri];
      if (cacheEntry) {
        if (cacheEntry.etag === etag) {
          return await loadFile(uri, cacheEntry, etagValid);
        } else {
          deleteFile(uri, cacheEntry);
        }
      }
    },
    getETag(uri) {
      return cacheInfo[uri]?.etag;
    },
    async getIfUpdatedSince(uri, expirationDurationInHours) {
      const cacheEntry = cacheInfo[uri];
      if (cacheEntry) {
        const lastUpdatedInHours = (Date.now() - cacheEntry.updateTime) / 1000 / 60 / 60;
        if (lastUpdatedInHours < expirationDurationInHours) {
          return await loadFile(uri, cacheInfo[uri], false);
        }
      }
    },
    async put(uri, etag, content) {
      try {
        const fileName = getCacheFileName(uri);
        await writeFile(join(cacheLocation, fileName), content);
        const entry: CacheEntry = { etag, fileName, updateTime: Date.now() };
        cacheInfo[uri] = entry;
      } catch (e) {
        delete cacheInfo[uri];
      } finally {
        await updateMemento();
      }
    },
  };
}

export interface RequestCache {
  clearCache(): Promise<string[]>;
  get(uri: string, etag: string, etagValid: boolean): Promise<Uint8Array | undefined>;
  getETag(uri: string): string | undefined;
  getIfUpdatedSince(uri: string, expirationDurationInHours: number): Promise<Uint8Array | undefined>;
  put(uri: string, etag: string, content: Uint8Array): Promise<void>;
}

function getCacheFileName(uri: string): string {
  return createHash("MD5").update(uri).digest("hex");
}
