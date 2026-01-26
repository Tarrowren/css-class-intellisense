import { read_uint, write_uint } from "./buffer";
import { epoch_sz, file_id_sz, record_pos_sz, record_sz_sz } from "./def";

export class BitcaskKeyDir extends Map<string, Buffer> {}

export function dir_write(file_id: number, record_sz: number, record_pos: number, epoch: bigint): Buffer {
  const sz = file_id_sz + record_sz_sz + record_pos_sz + epoch_sz;

  let pos = 0;

  const buf = Buffer.allocUnsafe(sz);
  // prettier-ignore
  write_uint(buf, file_id_sz,    file_id,    pos);
  // prettier-ignore
  write_uint(buf, record_sz_sz,  record_sz,  pos += file_id_sz);
  // prettier-ignore
  write_uint(buf, record_pos_sz, record_pos, pos += record_sz_sz);
  // prettier-ignore
  write_uint(buf, epoch_sz,      epoch,      pos += record_pos_sz);

  return buf;
}

export function dir_read(buf: Buffer): { file_id: number; record_sz: number; record_pos: number; epoch: bigint } {
  let pos = 0;

  // prettier-ignore
  const file_id    = read_uint(buf, file_id_sz,    pos);
  // prettier-ignore
  const record_sz  = read_uint(buf, record_sz_sz,  pos += file_id_sz);
  // prettier-ignore
  const record_pos = read_uint(buf, record_pos_sz, pos += record_sz_sz);
  // prettier-ignore
  const epoch      = read_uint(buf, epoch_sz,      pos += record_pos_sz);

  return { file_id, record_sz, record_pos, epoch };
}
