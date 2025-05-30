class EmptyMap<K, V> implements Map<K, V> {
  clear(): void {}

  delete(_key: K): boolean {
    return false;
  }

  get(_key: K): V | undefined {
    return;
  }

  has(_key: K): boolean {
    return false;
  }

  set(_key: K, _value: V): this {
    throw new Error("readonly map");
  }

  get size(): number {
    return 0;
  }

  forEach(_callbackfn: (value: V, key: K, map: Map<K, V>) => void, _thisArg?: unknown): void {}

  keys(): MapIterator<K> {
    return Empty.array<K>().values();
  }

  values(): MapIterator<V> {
    return Empty.array<V>().values();
  }

  entries(): MapIterator<[K, V]> {
    return Empty.array<[K, V]>().values();
  }

  [Symbol.iterator](): MapIterator<[K, V]> {
    return Empty.array<[K, V]>().values();
  }

  get [Symbol.toStringTag](): string {
    return "EmptyMap";
  }
}

class EmptySet<T> implements Set<T> {
  clear(): void {}

  delete(_value: T): boolean {
    return false;
  }

  has(_value: T): boolean {
    return false;
  }

  add(_value: T): this {
    throw new Error("readonly set");
  }

  get size(): number {
    return 0;
  }

  forEach(_callbackfn: (value: T, value2: T, set: Set<T>) => void, _thisArg?: undefined): void {}

  keys(): SetIterator<T> {
    return Empty.array<T>().values();
  }

  values(): SetIterator<T> {
    return Empty.array<T>().values();
  }

  entries(): SetIterator<[T, T]> {
    return Empty.array<[T, T]>().values();
  }

  [Symbol.iterator](): SetIterator<T> {
    return Empty.array<T>().values();
  }

  get [Symbol.toStringTag](): string {
    return "EmptySet";
  }
}

export class Empty {
  private static readonly empty_array = Object.freeze<unknown[]>([]);
  static array<T>(): Array<T> {
    return this.empty_array as Array<T>;
  }

  private static readonly empty_map = new EmptyMap();
  static map<K, V>(): Map<K, V> {
    return this.empty_map as Map<K, V>;
  }

  private static readonly empty_set = new EmptySet();
  static set<T>(): Set<T> {
    return this.empty_set as Set<T>;
  }
}
