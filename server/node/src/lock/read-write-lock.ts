import { withResolvers } from "shared";
import type { Disposable } from "vscode-jsonrpc";
import { UnsafeNode, UnsafeQueue } from "./unsafe-queue";

export enum LockType {
  READ,
  WRITE,
}

export class ReadWriteLock implements Disposable {
  private readonly _ctx = new ReadWriteLockContext();
  private _disposed = false;

  get(type: LockType): Lock {
    if (this._disposed) {
      AbortSignal.abort().throwIfAborted();
    }
    return new Lock(type, this._ctx);
  }

  busy(type: LockType): boolean {
    return this._ctx.busy(type);
  }

  dispose(): void {
    this._disposed = true;
    let node = this._ctx.wait_queue.head();
    if (node) {
      const reason = AbortSignal.abort().reason;
      do {
        const ticket = node.value;

        if (ticket.reject) {
          ticket.reject(reason);
          ticket.resolve = null;
          ticket.reject = null;
        }
      } while ((node = node.next));
    }

    this._ctx.rsize = 0;
    this._ctx.wsize = 0;
    this._ctx.wait_queue.dispose();
  }
}

type ResolveFn = () => void;
type RejectFn = (err: Error) => void;

interface Ticket {
  type: LockType;
  resolve?: ResolveFn | null | undefined;
  reject?: RejectFn | null | undefined;
}

class ReadWriteLockContext {
  rsize: number = 0;
  wsize: number = 0;
  readonly wait_queue: UnsafeQueue<Ticket> = new UnsafeQueue();

  busy(type: LockType): boolean {
    return this.wsize > 0 || (type === LockType.WRITE && this.rsize > 0);
  }
}

enum LockStatus {
  UNLOCKED,
  LOCKING,
  LOCKED,
}

export class Lock {
  private _status: LockStatus = LockStatus.UNLOCKED;
  private readonly _node: UnsafeNode<Ticket>;

  constructor(
    type: LockType,
    private readonly _ctx: ReadWriteLockContext,
  ) {
    this._node = new UnsafeNode({ type });
  }

  get type(): LockType {
    return this._node.value.type;
  }

  lock(signal?: AbortSignal): Promise<void> | void {
    if (this._status !== LockStatus.UNLOCKED) {
      throw new Error("Lock already taken");
    }

    signal?.throwIfAborted();

    let _wait: Promise<void> | undefined;
    if (this._ctx.busy(this.type)) {
      const { promise, resolve, reject } = withResolvers<void>();
      this._node.value.resolve = resolve;
      this._node.value.reject = reject;

      if (signal) {
        const onabort = () => reject(signal.reason);
        _wait = (async () => {
          try {
            await promise;
            this._status = LockStatus.LOCKED;
          } catch (err) {
            this._status = LockStatus.UNLOCKED;
            throw err;
          } finally {
            signal.removeEventListener("abort", onabort);
          }
        })();
        signal.addEventListener("abort", onabort);
      } else {
        _wait = (async () => {
          try {
            await promise;
            this._status = LockStatus.LOCKED;
          } catch (err) {
            this._status = LockStatus.UNLOCKED;
            throw err;
          }
        })();
      }
      this._status = LockStatus.LOCKING;
      this._ctx.wait_queue.push(this._node);
    } else {
      this._status = LockStatus.LOCKED;
    }

    if (this.type === LockType.READ) {
      this._ctx.rsize++;
    } else {
      this._ctx.wsize++;
    }

    return _wait;
  }

  try_lock(): boolean {
    if (this._status !== LockStatus.UNLOCKED) {
      throw new Error("Lock already taken");
    }

    if (this._ctx.busy(this.type)) {
      return false;
    }

    this._status = LockStatus.LOCKED;

    if (this.type === LockType.READ) {
      this._ctx.rsize++;
    } else {
      this._ctx.wsize++;
    }

    return true;
  }

  downgrading(): void {
    if (this._status !== LockStatus.LOCKED) {
      throw new Error("Lock already released");
    }

    if (this.type === LockType.READ) {
      return;
    }

    this._node.value.type = LockType.READ;
    this._ctx.wsize--;
    this._ctx.rsize++;

    if (this._ctx.wait_queue.has(this._node)) {
      this._call_next(this._node);
    } else {
      const head = this._ctx.wait_queue.head();
      if (!head) {
        return;
      }

      const ticket = head.value;

      if (ticket.type === LockType.WRITE) {
        return;
      }

      if (ticket.resolve) {
        ticket.resolve();
        ticket.resolve = null;
        ticket.reject = null;
      }

      this._call_next(head);
    }
  }

  unlock(): void {
    if (this._status !== LockStatus.LOCKED) {
      throw new Error("Lock already released");
    }

    this._status = LockStatus.UNLOCKED;

    this._ctx.wait_queue.remove(this._node);
    this._node.value.resolve = null;
    this._node.value.reject = null;

    if (this.type === LockType.READ) {
      this._ctx.rsize--;
    } else {
      this._ctx.wsize--;
    }

    const head = this._ctx.wait_queue.head();
    if (!head) {
      return;
    }

    const ticket = head.value;
    if (!ticket.resolve) {
      return;
    }

    ticket.resolve();
    ticket.resolve = null;
    ticket.reject = null;

    if (ticket.type === LockType.WRITE) {
      return;
    }

    this._call_next(head);
  }

  private _call_next(node: UnsafeNode<Ticket>): void {
    let _node: UnsafeNode<Ticket> | null = node;
    while ((_node = _node.next)) {
      const ticket = _node.value;

      if (ticket.type === LockType.WRITE) {
        return;
      }

      if (ticket.resolve) {
        ticket.resolve();
        ticket.resolve = null;
        ticket.reject = null;
      }
    }
  }
}
