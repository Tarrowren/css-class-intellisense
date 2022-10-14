import { createHash } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import { Level } from "level";
import { join } from "path";

export interface RemoteFileCache {
  get(uri: string): Promise<string> | undefined;
  update(uri: string, content: string): Promise<void>;
  dispose(): Promise<void>;
}

export async function getRemoteFileCache(
  globalStoragePath: string
): Promise<RemoteFileCache> {
  const cacheLocation = join(globalStoragePath, "file-cache");
  await mkdir(cacheLocation, { recursive: true });

  const db = new Level<string, CacheEntry>(join(cacheLocation, "level"), {
    valueEncoding: "json",
  });
  const cache = new Map<string, CacheEntry>();

  for await (const [k, v] of db.iterator()) {
    cache.set(k, v);
  }

  return {
    get(uri) {
      const entry = cache.get(uri);
      if (entry) {
        return readFile(join(cacheLocation, entry.fileName), "utf8").catch(
          async (e) => {
            cache.delete(uri);
            await db.del(uri);
            throw e;
          }
        );
      }
    },
    async update(uri, content) {
      try {
        const fileName = getCacheFileName(uri);
        await writeFile(join(cacheLocation, fileName), content, "utf8");

        const entry: CacheEntry = { fileName };
        cache.set(uri, entry);
        await db.put(uri, entry);
      } catch (e) {
        cache.delete(uri);
        await db.del(uri);
      }
    },
    async dispose() {
      cache.clear();
      await db.close();
    },
  };
}

function getCacheFileName(uri: string): string {
  return createHash("MD5").update(uri).digest("hex");
}

interface CacheEntry {
  // etag: string;
  fileName: string;
  // updateTime: number;
}
