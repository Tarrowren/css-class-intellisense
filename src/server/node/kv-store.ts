import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname } from "path";
import { deserialize, serialize } from "v8";

export interface KVStore<K, V> {
  clear(): void;
  delete(key: K): void;
  entries(): IterableIterator<[K, V]>;
  get(key: K): V | undefined;
  has(key: K): boolean;
  set(key: K, value: V): void;
  readonly size: number;
  close(): Promise<void>;
}

export async function getKVStore<K, V>(fsPath: string): Promise<KVStore<K, V>> {
  let cache: Map<K, V>;
  let immediate: NodeJS.Immediate | null | undefined;
  let controller: AbortController | null | undefined;

  await mkdir(dirname(fsPath), { recursive: true });

  try {
    const buf = await readFile(fsPath);
    const obj = deserialize(buf);
    if (obj instanceof Map) {
      cache = obj;
    } else {
      cache = new Map();
    }
  } catch (e) {
    cache = new Map();
  }

  async function write() {
    immediate = null;
    try {
      controller = new AbortController();
      await writeFile(fsPath, serialize(cache), { signal: controller.signal });
    } finally {
      controller = null;
    }
  }

  function clear() {
    if (immediate) {
      clearImmediate(immediate);
      immediate = null;
    }
    if (controller) {
      controller.abort();
      controller = null;
    }
  }

  function lazyWrite() {
    clear();
    immediate = setImmediate(write);
  }

  return {
    clear() {
      cache.clear();
      lazyWrite();
    },
    delete(key) {
      if (cache.has(key)) {
        cache.delete(key);
        lazyWrite();
      }
    },
    entries() {
      return cache.entries();
    },
    get(key) {
      return cache.get(key);
    },
    has(key) {
      return cache.has(key);
    },
    set(key, value) {
      cache.set(key, value);
      lazyWrite();
    },
    get size() {
      return cache.size;
    },
    async close() {
      clear();
      await writeFile(fsPath, serialize(cache));
      cache.clear();
    },
  };
}
