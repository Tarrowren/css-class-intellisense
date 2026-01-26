import { createReadStream } from "node:fs";
import { constants, open, readdir, unlink, type FileHandle } from "node:fs/promises";
import { join } from "node:path";
import type { Readable } from "node:stream";
import { scheduler } from "node:timers/promises";
import { withResolvers } from "shared";
import { LinkedMap, Touch } from "vscode-jsonrpc";
import { LockType, ReadWriteLock } from "../lock";
import { ByteUnit, to_byte } from "./buffer";
import { data_ext, hint_ext, manifest_ext, max_file_id } from "./def";
import { open_manifest, type BitcaskManifest, type FileMeta } from "./manifest";
import { create_queue } from "./queue";

export type ConsumReadableStream = (file_id: number, hint: boolean, stream: Readable) => Promise<void>;

export interface WriteResult {
  readonly id: number;
  readonly pos: number;
}

export interface BitcaskFilePoolOpts {
  /**
   * olded data file pool
   * @default 1000
   */
  readonly limit?: number;
  /**
   * olded data file pool
   * @default 0.5
   */
  readonly ratio?: number;

  /**
   * active data file max size
   * @default 2_147_483_648
   */
  readonly max_size?: number;

  /**
   * active data file sync after writes
   * @default 64
   */
  readonly sync_after_writes?: number;
}

export async function open_file_pool(db_path: string, opts?: BitcaskFilePoolOpts): Promise<BitcaskFilePool> {
  const manifest = await open_manifest(db_path);

  const files = new LinkedMap<number, FileMeta>();
  for (const file of manifest.data.files) {
    files.set(file.file_id, file);
  }

  const limit = _valid_value(opts?.limit, 1000, 16, 1024);
  const ratio = _valid_value(opts?.ratio, 0.5, 0, 1);
  const max_size = _valid_value(
    opts?.max_size,
    to_byte(2, ByteUnit.GB),
    to_byte(512, ByteUnit.MB),
    to_byte(2, ByteUnit.GB),
  );
  const sync_after_writes = _valid_value(opts?.sync_after_writes, 64, 1, 128);

  return new BitcaskFilePool(db_path, manifest, files, { limit, ratio, max_size, sync_after_writes });
}

function _valid_value(value: number | null | undefined, defaultValue: number, min: number, max: number): number {
  return Math.min(Math.max(value ?? defaultValue, min), max);
}

export class BitcaskFilePool {
  private _closed = false;

  private _id_sequence: number;

  //#region files

  private readonly _manifest: BitcaskManifest;
  private readonly _files: LinkedMap<number, FileMeta>;
  private readonly _files_lock = new ReadWriteLock();

  //#endregion

  //#region reader

  private readonly _readers = new LinkedMap<number, FileHandle>();
  private readonly _readers_open_flag = new Map<number, boolean>();
  private readonly _readers_lock = new ReadWriteLock();

  //#endregion

  //#region writer

  private readonly _write_queue = create_queue<_WriteTask>();
  private _writing: Promise<void> | null = null;

  private _writer: FileHandle | null = null;
  private _writer_id = -1;
  private _writer_pos = 0;

  //#endregion

  constructor(
    private readonly _db_path: string,
    manifest: BitcaskManifest,
    files: LinkedMap<number, FileMeta>,
    private readonly _opts: Required<BitcaskFilePoolOpts>,
  ) {
    this._id_sequence = files.isEmpty() ? 0 : Math.max(...files.keys());
    this._files = files;
    this._manifest = manifest;
  }

  async close(): Promise<void> {
    if (this._closed) {
      return;
    }

    this._closed = true;

    if (this._writing) {
      try {
        await this._writing;
      } catch (_err) {
        // ignore
      }
    }

    const lock1 = this._readers_lock.get(LockType.WRITE);
    await lock1.lock();
    try {
      let fh: FileHandle | undefined;
      while ((fh = this._readers.shift())) {
        if (fh === this._writer) {
          this._writer_id = -1;
          this._writer = null;
        }
        await fh.close();
      }

      if (this._writer) {
        await this._writer.close();
        this._writer_id = -1;
        this._writer = null;
      }
    } finally {
      lock1.unlock();
    }
    this._readers_lock.dispose();

    const lock2 = this._files_lock.get(LockType.WRITE);
    await lock2.lock();
    try {
      // ignore
    } finally {
      lock2.unlock();
    }
    this._files_lock.dispose();
  }

  private _check(): void {
    if (this._closed) {
      throw new Error("The file pool has been closed");
    }
  }

  next_file_id(): number {
    this._id_sequence = (this._id_sequence % max_file_id) + 1;

    if (this._files.has(this._id_sequence)) {
      throw new Error("The file ID has been exhausted");
    }

    return this._id_sequence;
  }

  //#region reader

  async read_olded_data_file_stream(consum: ConsumReadableStream): Promise<void> {
    this._check();

    for (const meta of [...this._files.values()]) {
      await this._read_stream(meta.file_id, meta.hint, consum);
    }
  }

  async read_stream(file_id: number, consum: ConsumReadableStream): Promise<void> {
    const meta = this._files.get(file_id);
    if (!meta) {
      throw new Error(`File ${file_id} not found`);
    }

    return await this._read_stream(meta.file_id, meta.hint, consum);
  }

  private async _read_stream(file_id: number, hint: boolean, consum: ConsumReadableStream): Promise<void> {
    if (hint) {
      await consum(file_id, true, createReadStream(join(this._db_path, file_id + hint_ext), { start: 0 }));
    } else {
      await this._read(file_id, async (fh) => {
        return await consum(file_id, false, fh.createReadStream({ autoClose: false, start: 0 }));
      });
    }
  }

  async read(file_id: number, pos: number, sz: number): Promise<Buffer> {
    return await this._read(file_id, async (fh) => {
      const buf = Buffer.allocUnsafe(sz);
      await fh.read(buf, 0, sz, pos);
      return buf;
    });
  }

  private async _read<T>(file_id: number, consum: (fh: FileHandle) => Promise<T>): Promise<T> {
    this._check();

    if (!this._files.has(file_id)) {
      throw new Error(`File ${file_id} not found`);
    }

    do {
      const type = this._readers.has(file_id) || this._readers_open_flag.get(file_id) ? LockType.READ : LockType.WRITE;
      this._readers_open_flag.set(file_id, true);
      const lock = this._readers_lock.get(type);
      await lock.lock();
      try {
        let fh = this._readers.get(file_id, Touch.AsNew);
        if (!fh) {
          if (type === LockType.READ) {
            break;
          }

          fh = await this._open_file(file_id);
        }

        lock.downgrading();
        return await consum(fh);
      } finally {
        lock.unlock();
      }
      // eslint-disable-next-line no-constant-condition
    } while (false);

    this._readers_open_flag.set(file_id, true);
    const lock = this._readers_lock.get(LockType.WRITE);
    await lock.lock();
    try {
      let fh = this._readers.get(file_id, Touch.AsNew);
      if (!fh) {
        fh = await this._open_file(file_id);
      }

      lock.downgrading();
      return await consum(fh);
    } finally {
      lock.unlock();
    }
  }

  private async _open_file(file_id: number): Promise<FileHandle> {
    if (this._readers.size >= this._opts.limit) {
      let i = Math.max(this._readers.size - Math.floor(this._opts.ratio * this._opts.limit), 0) + 1;
      for (const [id, fh] of [...this._readers.entries()]) {
        this._readers_open_flag.delete(id);
        this._readers.remove(id);
        if (fh !== this._writer) {
          i--;
          await fh.close();
        }

        if (i <= 0) {
          break;
        }
      }
    }

    let fh: FileHandle;
    if (file_id === this._writer_id) {
      fh = this._writer!;
    } else {
      fh = await open(join(this._db_path, file_id + data_ext), constants.O_RDONLY);
    }
    this._readers.set(file_id, fh, Touch.AsNew);
    return fh;
  }

  //#endregion

  //#region writer

  async write(buf: Buffer): Promise<WriteResult> {
    this._check();

    const { promise, resolve, reject } = withResolvers<WriteResult>();
    const result = this._write_queue.push({ buf, resolve, reject });
    if (!result) {
      throw new Error("The write queue overflow");
    }

    if (!this._writing) {
      this._writing = this._write();
    }
    return await promise;
  }

  async _write(): Promise<void> {
    try {
      await scheduler.yield();

      let _sz = 0;
      const _bufs: Buffer[] = [];
      const _others: _WriteOther[] = [];

      let _write_count = 0;
      while (!this._closed) {
        _sz = 0;
        _bufs.length = 0;
        _others.length = 0;

        let _task: _WriteTask | null | undefined;
        while ((_task = this._write_queue.peek())) {
          const { buf, resolve, reject } = _task;
          if (_sz + buf.byteLength > 16_384 && _sz > 0) {
            break;
          }

          this._write_queue.shift();

          _sz += buf.byteLength;
          _bufs.push(buf);
          _others.push({ sz: buf.byteLength, resolve, reject });
        }
        _task = null;

        if (_bufs.length === 0) {
          break;
        }

        if (!this._writer || this._writer_pos > this._opts.max_size) {
          // rotate
          let file_id: number;
          let fh: FileHandle;

          const lock1 = this._files_lock.get(LockType.WRITE);
          await lock1.lock();
          try {
            file_id = this.next_file_id();

            const flags = constants.O_TRUNC | constants.O_CREAT | constants.O_RDWR | constants.O_EXCL;
            fh = await open(join(this._db_path, file_id + data_ext), flags);
            try {
              await this._manifest.write({ files: [...this._manifest.data.files, { file_id, hint: false }] });
            } catch (err) {
              try {
                await fh.close();
              } catch (_err) {
                // ignore
              }
              throw err;
            }

            this._files.clear();
            for (const file of this._manifest.data.files) {
              this._files.set(file.file_id, file);
            }
          } finally {
            lock1.unlock();
          }

          const lock2 = this._readers_lock.get(LockType.WRITE);
          await lock2.lock();
          try {
            if (this._writer) {
              if (!this._readers.has(this._writer_id)) {
                if (this._readers.size < this._opts.limit) {
                  this._readers.set(this._writer_id, this._writer, Touch.AsOld);
                } else {
                  await this._writer.close();
                }
              }
            }

            this._writer = fh;
            this._writer_id = file_id;
            this._writer_pos = 0;

            if (this._readers.size < this._opts.limit) {
              this._readers.set(file_id, fh, Touch.AsOld);
            }
          } finally {
            lock2.unlock();
          }
        }

        const buf = Buffer.concat(_bufs, _sz);
        _bufs.length = 0;

        const pos = this._writer_pos;

        let reason: unknown | undefined;
        try {
          await this._writer.write(buf, 0, _sz, pos);
          _write_count++;
          if (_write_count >= this._opts.sync_after_writes || this._write_queue.is_empty()) {
            await this._writer.sync();
            _write_count = 0;
          }
        } catch (err) {
          reason = err;
        }

        if (reason) {
          for (const o of _others) {
            o.reject(reason);
          }
        } else {
          this._writer_pos = pos + _sz;
          let _pos = pos;
          for (const o of _others) {
            o.resolve({ id: this._writer_id, pos: _pos });
            _pos += o.sz;
          }
        }

        _sz = 0;
        _others.length = 0;
      }

      if (this._closed) {
        if (!this._write_queue.is_empty()) {
          const err = new Error("The file pool has been closed");
          let chunk: _WriteTask | undefined;
          while ((chunk = this._write_queue.shift())) {
            chunk?.reject(err);
          }
        }
      }
    } finally {
      this._writing = null;
    }
  }

  //#endregion

  older_files(): FileMeta[] {
    return [...this._files.values()].filter((v) => v.file_id !== this._writer_id);
  }

  async update_files(older_file_ids: number[], merged_files: FileMeta[]): Promise<void> {
    const lock = this._files_lock.get(LockType.WRITE);
    await lock.lock();
    try {
      await this._manifest.write({
        files: [...merged_files, ...this._manifest.data.files.filter((v) => !older_file_ids.includes(v.file_id))],
      });

      this._files.clear();
      for (const file of this._manifest.data.files) {
        this._files.set(file.file_id, file);
      }
    } finally {
      lock.unlock();
    }
  }

  async update_readers(older_file_ids: number[]): Promise<void> {
    const lock = this._readers_lock.get(LockType.WRITE);
    await lock.lock();
    try {
      for (const [id, fh] of [...this._readers.entries()]) {
        if (!older_file_ids.includes(id)) {
          continue;
        }

        this._readers_open_flag.delete(id);
        this._readers.remove(id);
        if (fh !== this._writer) {
          await fh.close();
        }
      }
    } finally {
      lock.unlock();
    }
  }

  async clear_files(): Promise<void> {
    const lock = this._files_lock.get(LockType.READ);
    await lock.lock();
    try {
      const filenames = [
        this._manifest.id + manifest_ext,
        ...this._manifest.data.files.flatMap(({ file_id, hint }) => {
          return hint ? [file_id + data_ext, file_id + hint_ext] : [file_id + data_ext];
        }),
      ];

      const files = await readdir(this._db_path, { withFileTypes: true });
      for (const file of files) {
        if (!file.isFile()) {
          continue;
        }

        const name = file.name;
        if (!(name.endsWith(".data") || name.endsWith(".hint") || name.endsWith(".manifest.json"))) {
          continue;
        }

        if (!filenames.includes(name)) {
          try {
            await unlink(join(this._db_path, name));
          } catch (_err) {
            // ignore
          }
        }
      }
    } finally {
      lock.unlock();
    }
  }
}

interface _WriteTask {
  buf: Buffer;
  resolve: (result: WriteResult) => void;
  reject: (reason: unknown) => void;
}

interface _WriteOther {
  sz: number;
  resolve: (pos: WriteResult) => void;
  reject: (reason: unknown) => void;
}
