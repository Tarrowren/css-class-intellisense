import { createHash } from "crypto";
import { mkdir, readdir, readFile, rm, unlink, writeFile } from "fs/promises";
import { join } from "path";
import { Disposable } from "vscode-languageserver";
import { getKVStore } from "./kv-store";

export interface RemoteFileCache extends Disposable {
  getETag(uri: string): string | undefined;
  put(uri: string, etag: string, content: string): Promise<void>;
  getIfUpdatedSince(uri: string, expirationDurationInHours: number): Promise<string> | undefined;
  get(uri: string, etag: string, etagValid: boolean): Promise<string> | undefined;
  clearCache(): Promise<void>;
}

export async function getRemoteFileCache(globalStoragePath: string): Promise<RemoteFileCache> {
  const location = join(globalStoragePath, "file-cache");
  await mkdir(location, { recursive: true });
  const store = await getKVStore<string, CacheEntry>(join(globalStoragePath, "file-cache.db"));

  function getLastUpdatedInHours(uri: string): number | undefined {
    const updateTime = store.get(uri)?.updateTime;
    if (updateTime !== undefined) {
      return (Date.now() - updateTime) / 1000 / 60 / 60;
    }
  }

  async function loadFile(uri: string, cacheEntry: CacheEntry, isUpdated: boolean): Promise<string> {
    const cacheLocation = join(location, cacheEntry.fileName);
    try {
      const content = await readFile(cacheLocation, "utf8");
      if (isUpdated) {
        cacheEntry.updateTime = Date.now();
        store.set(uri, cacheEntry);
      }
      return content;
    } catch (e) {
      store.delete(uri);
      throw e;
    }
  }

  async function deleteFile(uri: string, cacheEntry: CacheEntry): Promise<void> {
    const cacheLocation = join(location, cacheEntry.fileName);
    store.delete(uri);
    try {
      await rm(cacheLocation);
    } catch (e) {}
  }

  return {
    getETag(uri) {
      return store.get(uri)?.etag;
    },
    async put(uri, etag, content) {
      try {
        const fileName = getCacheFileName(uri);
        await writeFile(join(location, fileName), content);
        const entry: CacheEntry = { etag, fileName, updateTime: Date.now() };
        store.set(uri, entry);
      } catch (e) {
        store.delete(uri);
      }
    },
    getIfUpdatedSince(uri, expirationDurationInHours) {
      const lastUpdatedInHours = getLastUpdatedInHours(uri);
      if (lastUpdatedInHours !== undefined && lastUpdatedInHours < expirationDurationInHours) {
        return loadFile(uri, store.get(uri)!, false);
      }
    },
    get(uri, etag, etagValid) {
      const entry = store.get(uri);
      if (entry) {
        if (entry.etag === etag) {
          return loadFile(uri, entry, etagValid);
        } else {
          deleteFile(uri, entry);
        }
      }
    },
    async clearCache() {
      try {
        const files = await readdir(location);
        await Promise.all(files.map((file) => unlink(join(location, file)).catch((_e) => {})));
      } catch (e) {
      } finally {
        store.clear();
      }
    },
    dispose() {
      store.dispose();
    },
  };
}

function getCacheFileName(uri: string): string {
  return createHash("MD5").update(uri).digest("hex");
}

interface CacheEntry {
  etag: string;
  fileName: string;
  updateTime: number;
}
