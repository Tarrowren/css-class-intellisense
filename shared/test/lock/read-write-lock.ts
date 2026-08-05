import { beforeEach, describe, expect, it, vi } from "vitest";
import { CancellationTokenSource, type CancellationToken } from "vscode-jsonrpc";
import { LockType, ReadWriteLock } from "../../src/lock/read-write-lock";

describe("read-write-lock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  async function wlk(rwlock: ReadWriteLock, fn: Function, ms: number, token?: CancellationToken) {
    const lk = rwlock.get(LockType.WRITE);
    await lk.lock(token);
    try {
      fn();
      await sleep(ms);
    } finally {
      lk.unlock();
    }
  }

  async function rlk(rwlock: ReadWriteLock, fn: Function, ms: number) {
    const lk = rwlock.get(LockType.READ);
    await lk.lock();
    try {
      fn();
      await sleep(ms);
    } finally {
      lk.unlock();
    }
  }

  async function trywlk(rwlock: ReadWriteLock, fn: Function, ms: number) {
    const lk = rwlock.get(LockType.WRITE);
    if (lk.try_lock()) {
      try {
        fn();
        await sleep(ms);
      } finally {
        lk.unlock();
      }
    }
  }

  async function wtorlk(rwlock: ReadWriteLock, fn: Function, ms: number) {
    const lk = rwlock.get(LockType.WRITE);
    await lk.lock();
    try {
      fn();
      lk.downgrade();
      await sleep(ms);
    } finally {
      lk.unlock();
    }
  }

  async function sleep(ms = 1000) {
    await new Promise((c) => setTimeout(c, ms));
  }

  it("rlock", async () => {
    const rwlock = new ReadWriteLock();
    const data: any = rwlock;
    const read = vi.fn(() => {});

    rlk(rwlock, read, 1000);
    rlk(rwlock, read, 1000);
    rlk(rwlock, read, 1000);

    await vi.advanceTimersByTimeAsync(50);
    expect(data._ctx.rsize).eq(3);
    expect(data._ctx.wsize).eq(0);
    expect(read).toHaveBeenCalledTimes(3);

    rlk(rwlock, read, 1000);

    await vi.advanceTimersByTimeAsync(50);
    expect(data._ctx.rsize).eq(4);
    expect(data._ctx.wsize).eq(0);
    expect(read).toHaveBeenCalledTimes(4);

    await vi.advanceTimersByTimeAsync(1000);
    expect(data._ctx.rsize).eq(0);
    expect(data._ctx.wsize).eq(0);
  });

  it("wlock", async () => {
    const rwlock = new ReadWriteLock();
    const data: any = rwlock;
    const write = vi.fn(() => {});

    wlk(rwlock, write, 1000);
    wlk(rwlock, write, 1000);
    wlk(rwlock, write, 1000);

    await vi.advanceTimersByTimeAsync(50);
    expect(data._ctx.rsize).eq(0);
    expect(data._ctx.wsize).eq(3);
    expect(write).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(data._ctx.rsize).eq(0);
    expect(data._ctx.wsize).eq(2);
    expect(write).toHaveBeenCalledTimes(2);

    wlk(rwlock, write, 1000);

    await vi.advanceTimersByTimeAsync(1000);
    expect(data._ctx.rsize).eq(0);
    expect(data._ctx.wsize).eq(2);
    expect(write).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(1000);
    expect(data._ctx.rsize).eq(0);
    expect(data._ctx.wsize).eq(1);
    expect(write).toHaveBeenCalledTimes(4);

    await vi.advanceTimersByTimeAsync(1000);
    expect(data._ctx.rsize).eq(0);
    expect(data._ctx.wsize).eq(0);
  });

  it("rwlock", async () => {
    const rwlock = new ReadWriteLock();
    const write = vi.fn(() => {});
    const read = vi.fn(() => {});

    rlk(rwlock, read, 1000);
    wlk(rwlock, write, 1000);

    await vi.advanceTimersByTimeAsync(50);
    expect(read).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(0);

    wlk(rwlock, write, 1000);

    await vi.advanceTimersByTimeAsync(1000);
    expect(read).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(1);

    rlk(rwlock, read, 1000);

    await vi.advanceTimersByTimeAsync(1000);
    expect(read).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(2);

    rlk(rwlock, read, 1000);

    await vi.advanceTimersByTimeAsync(1000);
    expect(read).toHaveBeenCalledTimes(3);
    expect(write).toHaveBeenCalledTimes(2);

    wlk(rwlock, write, 1000);

    await vi.advanceTimersByTimeAsync(1000);
    expect(read).toHaveBeenCalledTimes(3);
    expect(write).toHaveBeenCalledTimes(3);
  });

  it("trylock", async () => {
    const rwlock = new ReadWriteLock();
    const write = vi.fn(() => {});

    wlk(rwlock, write, 1000);
    trywlk(rwlock, write, 1000);

    await vi.advanceTimersByTimeAsync(50);
    expect(write).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(write).toHaveBeenCalledTimes(1);

    trywlk(rwlock, write, 1000);

    await vi.advanceTimersByTimeAsync(50);
    expect(write).toHaveBeenCalledTimes(2);
  });

  it("wtorlock - rlock", async () => {
    const rwlock = new ReadWriteLock();
    const dosth = vi.fn(() => {});
    const read = vi.fn(() => {});

    wtorlk(rwlock, dosth, 1000);
    rlk(rwlock, read, 1000);

    await vi.advanceTimersByTimeAsync(50);
    expect(dosth).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("wlock - wtorlock - rlock", async () => {
    const rwlock = new ReadWriteLock();
    const write = vi.fn(() => {});
    const dosth = vi.fn(() => {});
    const read = vi.fn(() => {});

    wlk(rwlock, write, 1000);
    wtorlk(rwlock, dosth, 1000);
    rlk(rwlock, read, 1000);

    await vi.advanceTimersByTimeAsync(50);
    expect(write).toHaveBeenCalledTimes(1);
    expect(dosth).toHaveBeenCalledTimes(0);
    expect(read).toHaveBeenCalledTimes(0);

    await vi.advanceTimersByTimeAsync(1000);
    expect(write).toHaveBeenCalledTimes(1);
    expect(dosth).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("wtorlock - wlock", async () => {
    const rwlock = new ReadWriteLock();
    const dosth = vi.fn(() => {});
    const write = vi.fn(() => {});

    wtorlk(rwlock, dosth, 1000);
    wlk(rwlock, write, 1000);

    await vi.advanceTimersByTimeAsync(50);
    expect(dosth).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(0);

    await vi.advanceTimersByTimeAsync(1000);
    expect(dosth).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("wlock - wtorlock - wlock", async () => {
    const rwlock = new ReadWriteLock();
    const dosth = vi.fn(() => {});
    const write = vi.fn(() => {});

    wlk(rwlock, write, 1000);
    wtorlk(rwlock, dosth, 1000);
    wlk(rwlock, write, 1000);

    await vi.advanceTimersByTimeAsync(50);
    expect(dosth).toHaveBeenCalledTimes(0);
    expect(write).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(dosth).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(dosth).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(2);
  });

  it("abort", async () => {
    const rwlock = new ReadWriteLock();
    const write = vi.fn(() => {});
    const source = new CancellationTokenSource();

    wlk(rwlock, write, 1000);
    const result = wlk(rwlock, write, 1000, source.token);
    wlk(rwlock, write, 1000);

    expect(result).toBeInstanceOf(Promise);

    await vi.advanceTimersByTimeAsync(50);
    source.cancel();

    await expect(result).rejects.toThrowError(/cancelled/);

    expect(write).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(write).toHaveBeenCalledTimes(2);
  });
});
