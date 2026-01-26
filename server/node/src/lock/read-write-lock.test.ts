import { beforeEach, describe, expect, it, vi } from "vitest";
import { LockType, ReadWriteLock } from "./read-write-lock";

describe("read-write-lock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  async function wlk(source: ReadWriteLock, fn: Function, ms: number, signal?: AbortSignal) {
    const lock = source.get(LockType.WRITE);
    await lock.lock(signal);
    try {
      fn();
      await sleep(ms);
    } finally {
      lock.unlock();
    }
  }

  async function rlk(source: ReadWriteLock, fn: Function, ms: number) {
    const lock = source.get(LockType.READ);
    await lock.lock();
    try {
      fn();
      await sleep(ms);
    } finally {
      lock.unlock();
    }
  }

  async function trywlk(source: ReadWriteLock, fn: Function, ms: number) {
    const lock = source.get(LockType.WRITE);
    if (lock.try_lock()) {
      try {
        fn();
        await sleep(ms);
      } finally {
        lock.unlock();
      }
    }
  }

  async function wtorlk(source: ReadWriteLock, fn: Function, ms: number) {
    const lock = source.get(LockType.WRITE);
    await lock.lock();
    try {
      fn();
      lock.downgrading();
      await sleep(ms);
    } finally {
      lock.unlock();
    }
  }

  async function sleep(ms = 1000) {
    await new Promise((c) => setTimeout(c, ms));
  }

  it("rlock", async () => {
    const source = new ReadWriteLock();
    const data: any = source;
    const read = vi.fn(() => {});

    rlk(source, read, 1000);
    rlk(source, read, 1000);
    rlk(source, read, 1000);

    await vi.advanceTimersByTimeAsync(50);
    expect(data._ctx.rsize).eq(3);
    expect(data._ctx.wsize).eq(0);
    expect(read).toHaveBeenCalledTimes(3);

    rlk(source, read, 1000);

    await vi.advanceTimersByTimeAsync(50);
    expect(data._ctx.rsize).eq(4);
    expect(data._ctx.wsize).eq(0);
    expect(read).toHaveBeenCalledTimes(4);

    await vi.advanceTimersByTimeAsync(1000);
    expect(data._ctx.rsize).eq(0);
    expect(data._ctx.wsize).eq(0);
  });

  it("wlock", async () => {
    const source = new ReadWriteLock();
    const data: any = source;
    const write = vi.fn(() => {});

    wlk(source, write, 1000);
    wlk(source, write, 1000);
    wlk(source, write, 1000);

    await vi.advanceTimersByTimeAsync(50);
    expect(data._ctx.rsize).eq(0);
    expect(data._ctx.wsize).eq(3);
    expect(write).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(data._ctx.rsize).eq(0);
    expect(data._ctx.wsize).eq(2);
    expect(write).toHaveBeenCalledTimes(2);

    wlk(source, write, 1000);

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
    const source = new ReadWriteLock();
    const write = vi.fn(() => {});
    const read = vi.fn(() => {});

    rlk(source, read, 1000);
    wlk(source, write, 1000);

    await vi.advanceTimersByTimeAsync(50);
    expect(read).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(0);

    wlk(source, write, 1000);

    await vi.advanceTimersByTimeAsync(1000);
    expect(read).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(1);

    rlk(source, read, 1000);

    await vi.advanceTimersByTimeAsync(1000);
    expect(read).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(2);

    rlk(source, read, 1000);

    await vi.advanceTimersByTimeAsync(1000);
    expect(read).toHaveBeenCalledTimes(3);
    expect(write).toHaveBeenCalledTimes(2);

    wlk(source, write, 1000);

    await vi.advanceTimersByTimeAsync(1000);
    expect(read).toHaveBeenCalledTimes(3);
    expect(write).toHaveBeenCalledTimes(3);
  });

  it("trylock", async () => {
    const source = new ReadWriteLock();
    const write = vi.fn(() => {});

    wlk(source, write, 1000);
    trywlk(source, write, 1000);

    await vi.advanceTimersByTimeAsync(50);
    expect(write).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(write).toHaveBeenCalledTimes(1);

    trywlk(source, write, 1000);

    await vi.advanceTimersByTimeAsync(50);
    expect(write).toHaveBeenCalledTimes(2);
  });

  it("wtorlock - rlock", async () => {
    const source = new ReadWriteLock();
    const dosth = vi.fn(() => {});
    const read = vi.fn(() => {});

    wtorlk(source, dosth, 1000);
    rlk(source, read, 1000);

    await vi.advanceTimersByTimeAsync(50);
    expect(dosth).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("wlock - wtorlock - rlock", async () => {
    const source = new ReadWriteLock();
    const write = vi.fn(() => {});
    const dosth = vi.fn(() => {});
    const read = vi.fn(() => {});

    wlk(source, write, 1000);
    wtorlk(source, dosth, 1000);
    rlk(source, read, 1000);

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
    const source = new ReadWriteLock();
    const dosth = vi.fn(() => {});
    const write = vi.fn(() => {});

    wtorlk(source, dosth, 1000);
    wlk(source, write, 1000);

    await vi.advanceTimersByTimeAsync(50);
    expect(dosth).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(0);

    await vi.advanceTimersByTimeAsync(1000);
    expect(dosth).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("wlock - wtorlock - wlock", async () => {
    const source = new ReadWriteLock();
    const dosth = vi.fn(() => {});
    const write = vi.fn(() => {});

    wlk(source, write, 1000);
    wtorlk(source, dosth, 1000);
    wlk(source, write, 1000);

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
    const source = new ReadWriteLock();
    const write = vi.fn(() => {});
    const controller = new AbortController();

    wlk(source, write, 1000);
    const result = wlk(source, write, 1000, controller.signal);

    expect(result).toBeInstanceOf(Promise);

    await vi.advanceTimersByTimeAsync(50);
    controller.abort();

    await expect(result).rejects.toThrowError(/aborted/);

    await vi.advanceTimersByTimeAsync(1000);
    expect(write).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(write).toHaveBeenCalledTimes(1);
  });
});
