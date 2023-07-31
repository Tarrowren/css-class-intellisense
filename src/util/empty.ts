class EmptyMap<K, V> extends Map<K, V> {
  has(_key: K): boolean {
    return false;
  }

  get(_key: K): V | undefined {
    return;
  }

  delete(_key: K): boolean {
    return false;
  }

  clear(): void {
    return;
  }

  get size(): number {
    return 0;
  }

  set(_key: K, _value: V): this {
    throw new Error("Unsupported Operation");
  }
}

class EmptySet<T> extends Set<T> {
  has(_value: T): boolean {
    return false;
  }

  delete(_value: T): boolean {
    return false;
  }

  clear(): void {
    return;
  }

  get size(): number {
    return 0;
  }

  add(_value: T): this {
    throw new Error("Unsupported Operation");
  }
}

const EMPTY_MAP = new EmptyMap();

const EMPTY_SET = new EmptySet();

export function emptyMap<K, V>(): Map<K, V> {
  return EMPTY_MAP as Map<K, V>;
}

export function emptySet<T>(): Set<T> {
  return EMPTY_SET as Set<T>;
}
