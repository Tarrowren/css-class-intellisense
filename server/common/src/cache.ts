import { LRUCache, type Disposable } from "vscode-languageserver";

export class Cache<K, V> extends LRUCache<K, V> implements Disposable {
  private constructor(limit: number, ratio: number) {
    super(limit, ratio);
  }

  dispose(): void {
    this.clear();
  }

  static create<K, V>(limit = 1024, ratio = 0.5): Cache<K, V> {
    return new Cache<K, V>(limit, ratio);
  }
}
