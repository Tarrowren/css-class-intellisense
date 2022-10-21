import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname } from "path";

export interface KVStore<V> {
  clear(): void;
  delete(key: string): void;
  get(key: string): V | undefined;
  has(key: string): boolean;
  set(key: string, value: V): void;
  readonly size: number;
  close(): Promise<void>;
}

export async function getKVStore<V>(
  fsPath: string,
  serialize: (data: Record<string, V>) => string,
  deserialize: (json: string) => Record<string, V> | undefined
): Promise<KVStore<V>> {
  let size = 0;
  let cache: Record<string, V>;
  let immediate: NodeJS.Immediate | null | undefined;
  let controller: AbortController | null | undefined;

  await mkdir(dirname(fsPath), { recursive: true });

  try {
    const json = await readFile(fsPath, "utf8");
    const data = deserialize(json);
    if (data) {
      cache = data;
      size = Object.keys(data).length;
    } else {
      cache = {};
    }
  } catch (e) {
    cache = {};
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
      cache = {};
      size = 0;
      lazyWrite();
    },
    delete(key) {
      if (cache[key]) {
        delete cache[key];
        size--;
        lazyWrite();
      }
    },
    get(key) {
      return cache[key];
    },
    has(key) {
      return !!cache[key];
    },
    set(key, value) {
      cache[key] = value;
      size++;
      lazyWrite();
    },
    get size() {
      return size;
    },
    async close() {
      clear();
      await writeFile(fsPath, serialize(cache));
      cache = {};
    },
  };
}
