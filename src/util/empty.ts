// TODO
const EMPTY_MAP = new Map<any, any>();
const EMPTY_SET = new Set<any>();

export function emptyMap<K, V>(): Map<K, V> {
  return EMPTY_MAP;
}

export function emptySet<T>(): Set<T> {
  return EMPTY_SET;
}
