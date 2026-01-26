export function create_queue<T>(): Queue<T> {
  return new Queue<T>(1024 * 1024);
}

export class Queue<T> {
  constructor(private readonly _size: number) {}

  private readonly _array = new Array<T | undefined>(this._size);
  private _head = 0;
  private _tail = 0;

  push(value: T): boolean {
    const index = (this._tail + 1) % this._size;
    if (index === this._head) {
      return false;
    }

    this._array[this._tail] = value;
    this._tail = index;
    return true;
  }

  peek(): T | undefined {
    if (this.is_empty()) {
      return;
    }

    return this._array[this._head];
  }

  shift(): T | undefined {
    if (this.is_empty()) {
      return;
    }

    const value = this._array[this._head];

    this._array[this._head] = undefined;
    this._head = (this._head + 1) % this._size;

    return value;
  }

  is_empty(): boolean {
    return this._head === this._tail;
  }
}
