import { constants, readFile, unlink, writeFile } from "node:fs/promises";

const flags = constants.O_TRUNC | constants.O_CREAT | constants.O_WRONLY | constants.O_EXCL;
const flags_force = constants.O_TRUNC | constants.O_CREAT | constants.O_WRONLY;

async function get(path: string, pid: string): Promise<void> {
  try {
    await writeFile(path, pid, { flag: flags, encoding: "ascii" });
  } catch (err) {
    const status = await stat(path, pid);

    switch (status) {
      case 0:
        break;
      case 1:
        await writeFile(path, pid, { flag: flags_force, encoding: "ascii" });
        break;
      default:
        throw err;
    }
  }
}

async function stat(path: string, current_pid: string): Promise<1 | 0 | -1> {
  const text = await readFile(path, "ascii");
  if (current_pid === text) {
    return 0;
  }

  const pid = Number.parseInt(text);
  if (Number.isSafeInteger(pid) && pid > 0) {
    try {
      process.kill(pid, 0);
      return -1;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ESRCH") {
        // No such process
        return 1;
      }
      return -1;
    }
  }

  return 1;
}

enum LockStatus {
  UNLOCKED,
  LOCKED,
  UNLOCKING,
  LOCKING,
}
export class LockFile {
  private _locked = LockStatus.UNLOCKED;

  constructor(private readonly _path: string) {}

  async lock(): Promise<void> {
    if (this._locked !== LockStatus.UNLOCKED) {
      throw new Error("Lock already taken");
    }

    this._locked = LockStatus.LOCKING;

    try {
      await get(this._path, "" + process.pid);
    } catch (err) {
      this._locked = LockStatus.UNLOCKED;
      throw err;
    }

    this._locked = LockStatus.LOCKED;
  }

  async unlock(): Promise<void> {
    if (this._locked !== LockStatus.LOCKED) {
      throw new Error("Lock already released");
    }

    this._locked = LockStatus.UNLOCKING;

    try {
      await unlink(this._path);
    } catch (_err) {
      // ingore
    }

    this._locked = LockStatus.UNLOCKED;
  }
}
