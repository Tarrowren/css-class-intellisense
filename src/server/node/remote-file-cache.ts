import { JTDSchemaType } from "ajv/dist/jtd";
import { createHash } from "crypto";
import { mkdir, readdir, readFile, rm, unlink, writeFile } from "fs/promises";
import { join } from "path";
import { ajv } from "./ajv";
import { getKVStore } from "./kv-store";

export interface RemoteFileCache {
  getETag(uri: string): string | undefined;
  put(uri: string, etag: string, content: string): Promise<void>;
  getIfUpdatedSince(uri: string, expirationDurationInHours: number): Promise<string> | undefined;
  get(uri: string, etag: string, etagValid: boolean): Promise<string> | undefined;
  clearCache(): Promise<void>;
  close(): Promise<void>;
}

export async function getRemoteFileCache(globalStoragePath: string): Promise<RemoteFileCache> {
  const location = join(globalStoragePath, "file-cache");
  await mkdir(location, { recursive: true });
  const store = await getKVStore<CacheEntry>(join(globalStoragePath, "file-cache.json"), serialize, deserialize);

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
      const entry = store.get(uri);
      if (entry) {
        const lastUpdatedInHours = (Date.now() - entry.updateTime) / 1000 / 60 / 60;
        if (lastUpdatedInHours < expirationDurationInHours) {
          return loadFile(uri, entry, false);
        }
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
    async close() {
      await store.close();
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

const schema: JTDSchemaType<Record<string, CacheEntry>> = {
  values: {
    properties: {
      etag: { type: "string" },
      fileName: { type: "string" },
      updateTime: { type: "float64" },
    },
  },
};

const serialize = ajv.compileSerializer(schema);
const deserialize = ajv.compileParser(schema);
