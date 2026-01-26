export class UnsafeNode<T> {
  public prev: UnsafeNode<T> | null = null;
  public next: UnsafeNode<T> | null = null;
  constructor(public readonly value: T) {}
}

export class UnsafeQueue<T> {
  private _head: UnsafeNode<T> | null = null;
  private _tail: UnsafeNode<T> | null = null;

  head(): UnsafeNode<T> | null {
    return this._head;
  }

  has(node: UnsafeNode<T>): boolean {
    return this._head === node || this._tail === node || !!node.next || !!node.prev;
  }

  push(node: UnsafeNode<T>): boolean {
    if (this.has(node)) {
      return false;
    }

    if (this._tail) {
      node.prev = this._tail;
      this._tail.next = node;
      this._tail = node;
    } else {
      this._head = node;
      this._tail = node;
    }

    return true;
  }

  remove(node: UnsafeNode<T>): boolean {
    if (!this.has(node)) {
      return false;
    }

    const prev = node.prev;
    const next = node.next;
    node.prev = null;
    node.next = null;

    if (this._head === node) {
      this._head = next;
    }
    if (this._tail === node) {
      this._tail = prev;
    }

    if (prev) {
      prev.next = next;
    }
    if (next) {
      next.prev = prev;
    }

    return true;
  }

  dispose(): void {
    this._head = null;
    this._tail = null;
  }
}
