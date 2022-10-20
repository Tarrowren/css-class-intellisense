import { writeFileSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname } from "path";
import { deserialize, serialize } from "v8";
import { Disposable } from "vscode-languageserver";

export interface KVStore<K, V> extends Disposable {
  clear(): void;
  delete(key: K): void;
  entries(): IterableIterator<[K, V]>;
  get(key: K): V | undefined;
  has(key: K): boolean;
  keys(): IterableIterator<K>;
  set(key: K, value: V): void;
  readonly size: number;
  values(): IterableIterator<V>;
}

export async function getKVStore<K, V>(fsPath: string): Promise<KVStore<K, V>> {
  let cache: Map<K, V>;

  let immediate: NodeJS.Immediate | null = null;
  let controller: AbortController | null = null;

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

  function lazyWrite() {
    if (immediate) {
      clearImmediate(immediate);
    }
    if (controller) {
      controller.abort();
    }

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
    keys() {
      return cache.keys();
    },
    set(key, value) {
      cache.set(key, value);
      lazyWrite();
    },
    get size() {
      return cache.size;
    },
    values() {
      return cache.values();
    },
    dispose() {
      if (immediate) {
        clearImmediate(immediate);
      }
      if (controller) {
        controller.abort();
      }
      writeFileSync(fsPath, serialize(cache));
      cache.clear();
    },
  };
}
