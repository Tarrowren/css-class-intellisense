import { UnsafeNode, UnsafeQueue, withResolvers } from "@cci/shared";
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
