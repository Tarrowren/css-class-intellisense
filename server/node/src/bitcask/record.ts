import type { Readable } from "node:stream";
import { read_byte, read_uint, read_utf8, write_byte, write_uint } from "./buffer";
import crc32 from "./crc32";
import { crc_sz, delete_flag, epoch_sz, key_sz_sz, max_record_sz, value_sz_sz } from "./def";
import { dir_read, dir_write } from "./dir";

export function record_write(key: Buffer, value: Buffer, epoch: bigint): Buffer {
  const key_sz = key.byteLength;
  const value_sz = value.byteLength;

  const sz = crc_sz + epoch_sz + key_sz_sz + value_sz_sz + key_sz + value_sz;
  if (sz > max_record_sz) {
    throw new Error(`The record size exceeds ${max_record_sz}`);
  }

  let pos = 0;

  const buf = Buffer.allocUnsafe(sz);
  // prettier-ignore
  write_uint(buf, epoch_sz,    epoch,    pos += crc_sz);
  // prettier-ignore
  write_uint(buf, key_sz_sz,   key_sz,   pos += epoch_sz);
  // prettier-ignore
  write_uint(buf, value_sz_sz, value_sz, pos += key_sz_sz);
  // prettier-ignore
  write_byte(buf,              key,      pos += value_sz_sz);
  // prettier-ignore
  write_byte(buf,              value,    pos += key_sz);

  const crc = crc32(buf.subarray(crc_sz));
  // prettier-ignore
  write_uint(buf, crc_sz,      crc,      0);

  return buf;
}

export function record_delete(key: Buffer, epoch: bigint): Buffer {
  const key_sz = key.byteLength;

  const sz = crc_sz + epoch_sz + key_sz_sz + value_sz_sz + key_sz;
  if (sz > max_record_sz) {
    throw new Error(`The record size exceeds ${max_record_sz}`);
  }

  let pos = 0;

  const buf = Buffer.allocUnsafe(sz);
  // prettier-ignore
  write_uint(buf, epoch_sz,    epoch,       pos += crc_sz);
  // prettier-ignore
  write_uint(buf, key_sz_sz,   key_sz,      pos += epoch_sz);
  // prettier-ignore
  write_uint(buf, value_sz_sz, delete_flag, pos += key_sz_sz);
  // prettier-ignore
  write_byte(buf,              key,         pos += value_sz_sz);

  const crc = crc32(buf.subarray(crc_sz));
  // prettier-ignore
  write_uint(buf, crc_sz,      crc,         0);

  return buf;
}

export function record_read(buf: Buffer): { key: string; value: Buffer; epoch: bigint } | undefined {
  let pos = 0;

  // prettier-ignore
  const crc      = read_uint(buf, crc_sz,      pos);
  // prettier-ignore
  const epoch    = read_uint(buf, epoch_sz,    pos += crc_sz);
  // prettier-ignore
  const key_sz   = read_uint(buf, key_sz_sz,   pos += epoch_sz);
  // prettier-ignore
  const value_sz = read_uint(buf, value_sz_sz, pos += key_sz_sz);
  // prettier-ignore
  const key      = read_utf8(buf,              pos += value_sz_sz, key_sz);

  const check_crc = crc32(buf.subarray(crc_sz));
  if (crc !== check_crc) {
    console.warn("CRC ERROR", key);
    return;
  }

  if (value_sz === delete_flag) {
    return;
  }

  // prettier-ignore
  const value    = read_byte(buf,              pos += key_sz, value_sz);

  return { key, value, epoch };
}

const head_sz = crc_sz + epoch_sz + key_sz_sz + value_sz_sz;
const empty_buf = Buffer.allocUnsafe(0);
export async function load_older_data_file<T extends Map<string, Buffer>>(
  file_id: number,
  stream: Readable,
  key_dir: T,
): Promise<void> {
  let file_pos = 0;
  let head: Buffer | null | undefined;
  let key: string | null | undefined;
  let value: Buffer | null | undefined;

  let crc = 0;
  let epoch = 0n;
  let key_sz = 0;
  let value_sz = 0;

  let check_crc = 0;

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
        check_crc = crc32(head.subarray(crc_sz), check_crc);

        let pos = 0;
        // prettier-ignore
        crc      = read_uint(head, crc_sz,      pos);
        // prettier-ignore
        epoch    = read_uint(head, epoch_sz,    pos += crc_sz);
        // prettier-ignore
        key_sz   = read_uint(head, key_sz_sz,   pos += epoch_sz);
        // prettier-ignore
        value_sz = read_uint(head, value_sz_sz, pos += key_sz_sz);
      }

      if (!key) {
        start_pos = end_pos;
        end_pos = start_pos + key_sz;
        if (end_pos > sz) {
          break;
        }
        key = read_utf8(buf, start_pos, key_sz);
        check_crc = crc32(read_byte(buf, start_pos, key_sz), check_crc);
      }

      if (!value) {
        start_pos = end_pos;
        if (value_sz === delete_flag) {
          value = empty_buf;
        } else {
          end_pos = start_pos + value_sz;
          if (end_pos > sz) {
            break;
          }
          value = read_byte(buf, start_pos, value_sz);
          check_crc = crc32(value, check_crc);
        }
      }

      const record_sz = head_sz + key_sz + (value_sz === delete_flag ? 0 : value_sz);
      const record_pos = file_pos;
      file_pos = record_pos + record_sz;

      if (crc !== check_crc) {
        console.warn("CRC ERROR", key);
      } else {
        const old = key_dir.get(key);
        if (!old || epoch >= dir_read(old).epoch) {
          if (value_sz === delete_flag) {
            key_dir.delete(key);
          } else {
            const dir = dir_write(file_id, record_sz, record_pos, epoch);
            key_dir.set(key, dir);
          }
        }
      }

      head = null;
      key = null;
      value = null;
      crc = 0;
      epoch = 0n;
      key_sz = 0;
      value_sz = 0;
      check_crc = 0;
    } while (end_pos < sz);

    if (end_pos > sz) {
      prev = buf.subarray(start_pos);
    }
  }
}
