import type { Disposable } from "vscode-languageserver";

// TODO
export class Cache<K, V> extends Map<K, V> implements Disposable {
  dispose(): void {
    this.clear();
  }
}
