import { constants, open, stat, unlink, utimes, type FileHandle } from "node:fs/promises";

const flags = constants.O_TRUNC | constants.O_CREAT | constants.O_WRONLY | constants.O_EXCL;
async function get(path: string): Promise<void> {
  let fh: FileHandle;
  try {
    fh = await open(path, flags);
  } catch (err) {
    const expired = await expire(path);
    if (expired) {
      fh = await open(path, flags);
    } else {
      throw err;
    }
  }

  try {
    await fh.close();
  } catch (_err) {
    // ignore
  }
}

// 1 minutes
const MAX_AGE = 60_000;
async function expire(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    const age = Date.now() - stats.mtime.getTime();
    if (age > MAX_AGE) {
      await unlink(path);
      return true;
    }

    return false;
  } catch (_err) {
    return false;
  }
}

enum LockStatus {
  UNLOCKED,
  LOCKED,
  UNLOCKING,
  LOCKING,
}
export class LockFile {
  private _locked = LockStatus.UNLOCKED;
  private _timer: NodeJS.Timeout | null = null;
  constructor(private readonly _path: string) {}

  async lock(): Promise<void> {
    if (this._locked !== LockStatus.UNLOCKED) {
      throw new Error("Lock already taken");
    }

    this._locked = LockStatus.LOCKING;

    try {
      await get(this._path);
    } catch (err) {
      this._locked = LockStatus.UNLOCKED;
      throw err;
    }

    this._timer = setInterval(async () => {
      const now = new Date();
      await utimes(this._path, now, now);
    }, 30_000);

    this._locked = LockStatus.LOCKED;
  }

  async unlock(): Promise<void> {
    if (this._locked !== LockStatus.LOCKED) {
      throw new Error("Lock already released");
    }

    this._locked = LockStatus.UNLOCKING;

    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }

    try {
      await unlink(this._path);
    } catch (_err) {
      // ingore
    }

    this._locked = LockStatus.UNLOCKED;
  }
}
