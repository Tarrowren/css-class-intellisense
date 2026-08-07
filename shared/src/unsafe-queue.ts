export class UnsafeNode<T> {
  public prev: UnsafeNode<T> | null = null;
  public next: UnsafeNode<T> | null = null;
  constructor(public readonly value: T) {}
}

export class UnsafeQueue<T> {
  private _head: UnsafeNode<T> | null = null;
  private _tail: UnsafeNode<T> | null = null;
  private _size = 0;

  dispose(): void {
    this._head = null;
    this._tail = null;
    this._size = 0;
  }

  has(node: UnsafeNode<T>): boolean {
    return this._head === node || this._tail === node || node.next !== null || node.prev !== null;
  }

  push(node: UnsafeNode<T>): boolean {
    if (this.has(node)) {
      return false;
    }

    if (this._tail) {
      node.prev = this._tail;
      this._tail.next = node;
    } else {
      this._head = node;
    }
    this._tail = node;

    this._size++;
    return true;
  }

  shift(): UnsafeNode<T> | null {
    if (this._head === null) {
      return null;
    }

    const node = this._head;
    const next = node.next;
    node.next = null;

    this._head = next;
    if (next === null) {
      this._tail = null;
    }

    this._size--;
    return node;
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

    this._size--;
    return true;
  }

  get size(): number {
    return this._size;
  }
}
