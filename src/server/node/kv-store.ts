import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname } from "path";

export interface KVStore<V> {
  clear(): void;
  delete(key: string): void;
  get(key: string): V | undefined;
  has(key: string): boolean;
  set(key: string, value: V): void;
  close(): Promise<void>;
}

function serialize(value: any): string {
  return JSON.stringify(value);
}

function deserialize(json: string): any {
  return JSON.parse(json);
}

export async function getKVStore<V>(fsPath: string, valid: (object: any) => object is V): Promise<KVStore<V>> {
  let cache: Record<string, V> = {};
  let immediate: NodeJS.Immediate | null | undefined;
  let controller: AbortController | null | undefined;

  await mkdir(dirname(fsPath), { recursive: true });

  try {
    const json = await readFile(fsPath, "utf8");
    const data = deserialize(json);
    if (typeof data === "object") {
      for (const uri in data) {
        const entry = data[uri];
        if (valid(entry)) {
          cache[uri] = entry;
        }
      }
    }
  } catch (e) {
    // ignore
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
      lazyWrite();
    },
    delete(key) {
      if (cache[key]) {
        delete cache[key];
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
      lazyWrite();
    },
    async close() {
      clear();
      await writeFile(fsPath, serialize(cache));
      cache = {};
    },
  };
}
