import { Type } from "./buffer";

export const crc_sz: Type.UINT32 = Type.UINT32;
export const epoch_sz: Type.UINT64 = Type.UINT64;

export const key_sz_sz: Type.UINT16 = Type.UINT16;
export const value_sz_sz: Type.UINT32 = Type.UINT32;
export const file_id_sz: Type.UINT16 = Type.UINT16;
export const record_sz_sz: Type.UINT32 = Type.UINT32;
export const record_pos_sz: Type.UINT32 = Type.UINT32;

export const max_key_sz: number = max_sz(key_sz_sz) - 1;
export const max_value_sz: number = max_sz(value_sz_sz) - 1;
export const max_file_id: number = max_sz(file_id_sz) - 1;
export const max_record_sz: number = max_sz(record_sz_sz) - 1;
export const max_record_pos: number = max_sz(record_pos_sz) - 1;

export const max_manifest_id: number = max_sz(Type.UINT16) - 1;

export const delete_flag: number = max_sz(value_sz_sz);

function max_sz(type: Type.UINT8 | Type.UINT16 | Type.UINT32) {
  return 2 ** (8 * type) - 1;
}

export const data_ext = ".data";
export const hint_ext = ".hint";

export const manifest_ext = ".manifest.json";
