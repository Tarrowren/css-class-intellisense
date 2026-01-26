import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { BitcaskKeyDir, dir_read, dir_write } from "./dir";
import { open_file_pool, type BitcaskFilePool, type BitcaskFilePoolOpts } from "./file-pool";
import { load_hint_file } from "./hint";
import { LockFile } from "./lockfile";
import { merge } from "./merge";
import { load_older_data_file, record_delete, record_read, record_write } from "./record";

export async function open_db(path: string, opts?: BitcaskFilePoolOpts): Promise<Bitcask> {
  const db_path = resolve(path);
  await mkdir(db_path, { recursive: true });

  const lock_file = new LockFile(join(db_path, ".LOCK"));
  await lock_file.lock();

  const file_pool = await open_file_pool(db_path, opts);
  const key_dir = new BitcaskKeyDir();

  await file_pool.read_olded_data_file_stream(async (file_id, hint, stream) => {
    if (hint) {
      await load_hint_file(file_id, stream, key_dir);
    } else {
      await load_older_data_file(file_id, stream, key_dir);
    }
  });

  return new Bitcask(db_path, lock_file, file_pool, key_dir);
}

export class Bitcask {
  constructor(
    private readonly _db_path: string,
    private readonly _lock_file: LockFile,
    private readonly _file_pool: BitcaskFilePool,
    private readonly _key_dir: BitcaskKeyDir,
  ) {}

  async get(key: string): Promise<Buffer | undefined> {
    const dir = this._key_dir.get(key);
    if (!dir) {
      return;
    }

    const { file_id, record_pos, record_sz } = dir_read(dir);

    const record = await this._file_pool.read(file_id, record_pos, record_sz);
    return record_read(record)?.value;
  }

  async put(key: string, value: Buffer): Promise<void> {
    const epoch = _epoch();
    const record = record_write(Buffer.from(key, "utf8"), value, epoch);

    const { id, pos } = await this._file_pool.write(record);

    const dir = dir_write(id, record.byteLength, pos, epoch);
    this._key_dir.set(key, dir);
  }

  async delete(key: string): Promise<void> {
    if (!this._key_dir.has(key)) {
      return;
    }

    const epoch = _epoch();
    const record = record_delete(Buffer.from(key, "utf8"), epoch);

    await this._file_pool.write(record);
    this._key_dir.delete(key);
  }

  *keys(): Generator<string> {
    for (const key of [...this._key_dir.keys()]) {
      yield key;
    }
  }

  async *values(): AsyncGenerator<Buffer> {
    for (const dir of [...this._key_dir.values()]) {
      const { file_id, record_pos, record_sz } = dir_read(dir);
      const record = await this._file_pool.read(file_id, record_pos, record_sz);
      const value = record_read(record)?.value;
      if (value) {
        yield value;
      }
    }
  }

  async *entries(): AsyncGenerator<[string, Buffer]> {
    for (const [key, dir] of [...this._key_dir.entries()]) {
      const { file_id, record_pos, record_sz } = dir_read(dir);
      const record = await this._file_pool.read(file_id, record_pos, record_sz);
      const value = record_read(record)?.value;
      if (value) {
        yield [key, value];
      }
    }
  }

  async merge(): Promise<void> {
    const lock_file = new LockFile(join(this._db_path, "merge.LOCK"));
    await lock_file.lock();
    try {
      const older_files = this._file_pool.older_files();
      if (older_files.length === 0 || older_files.every((v) => v.hint)) {
        return;
      }

      const older_file_ids = older_files.map((v) => v.file_id);

      const { key_dir, merged_files } = await merge(this._db_path, this._file_pool, older_files);
      await this._file_pool.update_files(older_file_ids, merged_files);

      if (key_dir) {
        for (const [key, older_dir] of this._key_dir) {
          const { file_id } = dir_read(older_dir);
          if (older_files.findIndex((o) => o.file_id === file_id) < 0) {
            continue;
          }

          const dir = key_dir.get(key);
          if (dir) {
            this._key_dir.set(key, dir);
          } else {
            this._key_dir.delete(key);
          }
        }

        key_dir.clear();
      }

      await this._file_pool.update_readers(older_file_ids);

      await this._file_pool.clear_files();
    } finally {
      await lock_file.unlock();
    }
  }

  async close(): Promise<void> {
    this._key_dir.clear();

    try {
      await this._file_pool.close();
    } catch (_err) {
      // ignore
    }

    try {
      await this._lock_file.unlock();
    } catch (_err) {
      // ignore
    }
  }
}

function _epoch(): bigint {
  return BigInt(Date.now());
}
