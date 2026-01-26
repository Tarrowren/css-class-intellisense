import { createWriteStream } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { LinkedMap, Touch } from "vscode-jsonrpc";
import { ByteUnit, to_byte } from "./buffer";
import { BitcaskKeyDir, dir_read, dir_write } from "./dir";
import type { BitcaskFilePool } from "./file-pool";
import { hint_write, load_hint_file } from "./hint";
import type { FileMeta } from "./manifest";
import { load_older_data_file } from "./record";

const max_file_size = to_byte(2, ByteUnit.GB);

export async function merge(
  db_path: string,
  file_pool: BitcaskFilePool,
  older_files: FileMeta[],
): Promise<{ key_dir: BitcaskKeyDir | null; merged_files: FileMeta[] }> {
  const key_dir_arr = await _load_key_dir_arr(older_files, file_pool);
  if (key_dir_arr.length === 0) {
    return { key_dir: null, merged_files: [] };
  }

  let sz = 0;
  let start = 0;
  const tasks: { file_id: number; start: number; end: number }[] = [];
  for (let i = 0; i < key_dir_arr.length; i++) {
    if (sz > max_file_size) {
      sz = 0;

      tasks.push({ file_id: file_pool.next_file_id(), start, end: i });
      start = i;
    }

    const [_k, v] = key_dir_arr[i];
    const record_sz = dir_read(v).record_sz;
    sz += record_sz;
  }

  tasks.push({ file_id: file_pool.next_file_id(), start, end: key_dir_arr.length });

  const key_dir = new BitcaskKeyDir();
  const merged_files: FileMeta[] = [];
  for (const { file_id, start, end } of tasks) {
    await pipeline(
      new _DataStream(file_pool, key_dir_arr, start, end),
      createWriteStream(join(db_path, file_id + ".data"), { flush: true }),
    );
    await pipeline(
      new _HintStream(file_id, key_dir, key_dir_arr, start, end),
      createWriteStream(join(db_path, file_id + ".hint"), { flush: true }),
    );
    merged_files.push({ file_id, hint: true });
  }

  return { key_dir, merged_files };
}

async function _load_key_dir_arr(files: FileMeta[], file_pool: BitcaskFilePool): Promise<[string, Buffer][]> {
  const key_dir = new _LinkedKeyDir();

  for (const { file_id } of files) {
    await file_pool.read_stream(file_id, async (file_id, hint, stream) => {
      if (hint) {
        await load_hint_file(file_id, stream, key_dir);
      } else {
        await load_older_data_file(file_id, stream, key_dir);
      }
    });
  }

  return [...key_dir];
}

class _LinkedKeyDir extends LinkedMap<string, Buffer> {
  set(key: string, value: Buffer, touch: Touch = Touch.AsNew): this {
    return super.set(key, value, touch);
  }
}

class _DataStream extends Readable {
  private _pos: number = this._start;

  constructor(
    private readonly _file_pool: BitcaskFilePool,
    private readonly _key_dir_arr: [string, Buffer][],
    private readonly _start: number,
    private readonly _end: number,
  ) {
    super();
  }

  async _read(_size: number): Promise<void> {
    if (this._pos < this._end) {
      const [_k, v] = this._key_dir_arr[this._pos];
      this._pos++;

      const { file_id, record_sz, record_pos } = dir_read(v);

      const record = await this._file_pool.read(file_id, record_pos, record_sz);
      this.push(record);
    } else {
      this.push(null);
    }
  }
}

class _HintStream extends Readable {
  private _pos: number = this._start;
  private _record_pos = 0;

  constructor(
    private readonly _file_id: number,
    private readonly _key_dir: BitcaskKeyDir,
    private readonly _key_dir_arr: [string, Buffer][],
    private readonly _start: number,
    private readonly _end: number,
  ) {
    super();
  }

  async _read(_size: number): Promise<void> {
    if (this._pos < this._end) {
      const [k, v] = this._key_dir_arr[this._pos];
      this._pos++;

      const { record_sz, epoch } = dir_read(v);

      this._key_dir.set(k, dir_write(this._file_id, record_sz, this._record_pos, epoch));
      const hint = hint_write(Buffer.from(k, "utf8"), record_sz, this._record_pos, epoch);
      this._record_pos += record_sz;
      this.push(hint);
    } else {
      this.push(null);
    }
  }
}
