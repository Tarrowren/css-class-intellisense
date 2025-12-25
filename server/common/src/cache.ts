import type { Disposable } from "vscode-languageserver";

// TODO
export class Cache<K, V> extends Map<K, V> implements Disposable {
  private constructor() {
    super();
  }

  dispose(): void {
    this.clear();
  }

  static create<K, V>(): Cache<K, V> {
    return new Cache<K, V>();
  }
}
