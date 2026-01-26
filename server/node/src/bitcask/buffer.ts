export enum Type {
  UINT8 = 0b1,
  UINT16 = 0b10,
  UINT32 = 0b100,
  UINT64 = 0b1000,
}

export function read_uint(buf: Buffer, type: Type.UINT8 | Type.UINT16 | Type.UINT32, pos: number): number;
export function read_uint(buf: Buffer, type: Type.UINT64, pos: number): bigint;
export function read_uint(buf: Buffer, type: Type, pos: number): number | bigint {
  switch (type) {
    case Type.UINT8:
      return buf.readUInt8(pos);
    case Type.UINT16:
      return buf.readUInt16BE(pos);
    case Type.UINT32:
      return buf.readUInt32BE(pos);
    case Type.UINT64:
      return buf.readBigUInt64BE(pos);
  }
}

export function read_byte(buf: Buffer, pos: number, sz: number): Buffer {
  return buf.subarray(pos, pos + sz);
}

export function read_utf8(buf: Buffer, pos: number, sz: number): string {
  return buf.toString("utf8", pos, pos + sz);
}

export function write_uint(
  buf: Buffer,
  type: Type.UINT8 | Type.UINT16 | Type.UINT32,
  value: number,
  pos: number,
): number;
export function write_uint(buf: Buffer, type: Type.UINT64, value: bigint, pos: number): number;
export function write_uint(buf: Buffer, type: Type, value: number | bigint, pos: number): number {
  switch (type) {
    case Type.UINT8:
      return buf.writeUInt8(value as number, pos);
    case Type.UINT16:
      return buf.writeUInt16BE(value as number, pos);
    case Type.UINT32:
      return buf.writeUInt32BE(value as number, pos);
    case Type.UINT64:
      return buf.writeBigUInt64BE(value as bigint, pos);
  }
}

export function write_byte(buf: Buffer, value: Buffer, pos: number): number {
  return value.copy(buf, pos);
}

export enum ByteUnit {
  B = 1,
  KB = 1024,
  MB = 1024 ** 2,
  GB = 1024 ** 3,
}

export function to_byte(sz: number, unit: ByteUnit): number {
  return sz * unit;
}
