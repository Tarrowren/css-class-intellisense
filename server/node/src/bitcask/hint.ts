import type { Readable } from "node:stream";
import { read_byte, read_uint, read_utf8, write_byte, write_uint } from "./buffer";
import { epoch_sz, key_sz_sz, record_pos_sz, record_sz_sz } from "./def";
import { dir_read, dir_write } from "./dir";

export function hint_write(key: Buffer, record_sz: number, record_pos: number, epoch: bigint): Buffer {
  const key_sz = key.byteLength;

  const sz = epoch_sz + key_sz_sz + record_sz_sz + record_pos_sz + key_sz;

  let pos = 0;

  const buf = Buffer.allocUnsafe(sz);
  // prettier-ignore
  write_uint(buf, epoch_sz,      epoch,      pos);
  // prettier-ignore
  write_uint(buf, key_sz_sz,     key_sz,     pos += epoch_sz);
  // prettier-ignore
  write_uint(buf, record_sz_sz,  record_sz,  pos += key_sz_sz);
  // prettier-ignore
  write_uint(buf, record_pos_sz, record_pos, pos += record_sz_sz);
  // prettier-ignore
  write_byte(buf,                key,        pos += record_pos_sz);

  return buf;
}

export function hint_read(buf: Buffer): { key: string; record_sz: number; record_pos: number; epoch: bigint } {
  let pos = 0;

  // prettier-ignore
  const epoch      = read_uint(buf, epoch_sz,      pos);
  // prettier-ignore
  const key_sz     = read_uint(buf, key_sz_sz,     pos += epoch_sz);
  // prettier-ignore
  const record_sz  = read_uint(buf, record_sz_sz,  pos += key_sz_sz);
  // prettier-ignore
  const record_pos = read_uint(buf, record_pos_sz, pos += record_sz_sz);
  // prettier-ignore
  const key        = read_utf8(buf,                pos += record_pos_sz, key_sz);

  return { key, record_sz, record_pos, epoch };
}

const head_sz = epoch_sz + key_sz_sz + record_sz_sz + record_pos_sz;
export async function load_hint_file<T extends Map<string, Buffer>>(
  file_id: number,
  stream: Readable,
  key_dir: T,
): Promise<void> {
  let head: Buffer | null | undefined;
  let key: string | null | undefined;

  let epoch = 0n;
  let key_sz = 0;
  let record_sz = 0;
  let record_pos = 0;

  let prev: Buffer | null | undefined;

  for await (const chunk of stream) {
    const buf: Buffer = prev ? Buffer.concat([prev, chunk]) : chunk;
    prev = null;

    const sz = buf.byteLength;

    let start_pos = 0;
    let end_pos = 0;

    do {
      if (!head) {
        start_pos = end_pos;
        end_pos = start_pos + head_sz;
        if (end_pos > sz) {
          break;
        }
        head = read_byte(buf, start_pos, head_sz);

        let pos = 0;
        // prettier-ignore
        epoch      = read_uint(head, epoch_sz,      pos);
        // prettier-ignore
        key_sz     = read_uint(head, key_sz_sz,     pos += epoch_sz);
        // prettier-ignore
        record_sz  = read_uint(head, record_sz_sz,  pos += key_sz_sz);
        // prettier-ignore
        record_pos = read_uint(head, record_pos_sz, pos += record_sz_sz);
      }

      if (!key) {
        start_pos = end_pos;
        end_pos = start_pos + key_sz;
        if (end_pos > sz) {
          break;
        }
        key = read_utf8(buf, start_pos, key_sz);
      }

      const old = key_dir.get(key);
      if (!old || epoch >= dir_read(old).epoch) {
        const dir = dir_write(file_id, record_sz, record_pos, epoch);
        key_dir.set(key, dir);
      }

      head = null;
      key = null;

      epoch = 0n;
      key_sz = 0;
      record_sz = 0;
      record_pos = 0;
    } while (end_pos < sz);

    if (end_pos > sz) {
      prev = buf.subarray(start_pos);
    }
  }
}
