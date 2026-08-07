import { withResolvers } from "@cci/shared";
import { CancellationTokenSource, Disposable, type CancellationToken } from "vscode-languageserver";
import { CancellationError } from "./cancellation";
import { scheduler } from "./env";

export class Semaphore implements Disposable {
  private readonly _source = new CancellationTokenSource();
  private readonly _queue = new UnsafeQueue<Waiting>();
  private _active = 0;

  constructor(private readonly _capacity: number) {}

  dispose(): void {
    this._source.cancel();

    let node: UnsafeNode<Waiting> | null | undefined;
    while ((node = this._queue.shift())) {
      node.value.reject(new CancellationError());
    }

    this._active = 0;
  }

  async lock<T>(thunk: Waiting<T>["thunk"], token: CancellationToken): Promise<T> {
    if (token.isCancellationRequested) {
      throw new CancellationError();
    }

    const { promise, resolve, reject } = withResolvers<unknown>();

    const node = new UnsafeNode<Waiting>({ thunk, resolve, reject });
    this._queue.push(node);

    const disposable = token.onCancellationRequested(() => {
      reject(new CancellationError());
      this._queue.remove(node);
    });

    this._next();

    try {
      return await (promise as Promise<T>);
    } finally {
      disposable.dispose();
    }
  }

  get active(): number {
    return this._active;
  }

  private _next(): void {
    if (this._queue.size === 0 || this._active >= this._capacity) {
      return;
    }

    scheduler()
      .yield(this._source.token)
      .then(() => {
        let node: UnsafeNode<Waiting> | null | undefined;
        while (this._active < this._capacity && (node = this._queue.shift())) {
          this._active++;
          node.value
            .thunk()
            .then(node.value.resolve)
            .catch(node.value.reject)
            .finally(() => {
              this._active--;
              this._next();
            });
        }
      })
      .catch((_err) => {
        // ignore
      });
  }
}

interface Waiting<T = unknown> {
  thunk: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

class UnsafeNode<T> {
  public prev: UnsafeNode<T> | null = null;
  public next: UnsafeNode<T> | null = null;
  constructor(public readonly value: T) {}
}

class UnsafeQueue<T> {
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
