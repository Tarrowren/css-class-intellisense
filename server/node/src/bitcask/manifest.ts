import { constants, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { manifest_ext, max_manifest_id } from "./def";

export interface Manifest {
  readonly files: ReadonlyArray<FileMeta>;
}

export interface FileMeta {
  readonly file_id: number;
  readonly hint: boolean;
}

export async function open_manifest(db_path: string): Promise<BitcaskManifest> {
  const current_path = join(db_path, "current.txt");

  let manifest_id = await _get_manifest_id(current_path);
  let manifest: Manifest;
  if (manifest_id === null) {
    manifest_id = 0;
    manifest = { files: [] };
  } else {
    manifest = (await _get_manifest(db_path, manifest_id)) ?? { files: [] };
  }

  return new BitcaskManifest(db_path, current_path, manifest_id, manifest);
}

async function _get_manifest_id(current_path: string): Promise<number | null> {
  const text = await readFile(current_path, { flag: constants.O_CREAT | constants.O_RDONLY, encoding: "ascii" });

  const value = Number.parseInt(text);
  if (!Number.isSafeInteger(value)) {
    return null;
  }

  return value;
}

async function _get_manifest(db_path: string, manifest_id: number): Promise<Manifest | null> {
  const manifest_path = join(db_path, manifest_id + manifest_ext);
  const text = await readFile(manifest_path, { flag: constants.O_CREAT | constants.O_RDONLY, encoding: "ascii" });

  try {
    return JSON.parse(text);
  } catch (_err) {
    return null;
  }
}

export class BitcaskManifest {
  constructor(
    private readonly _db_path: string,
    private readonly _current_path: string,
    private _current_manifest_id: number,
    private _current_manifest: Manifest,
  ) {}

  get id(): number {
    return this._current_manifest_id;
  }

  get data(): Manifest {
    return this._current_manifest;
  }

  async write(data: Manifest): Promise<void> {
    const id = (this._current_manifest_id % max_manifest_id) + 1;

    const manifest_file_name = id + manifest_ext;
    const manifest_path = join(this._db_path, manifest_file_name);

    const flag = constants.O_TRUNC | constants.O_CREAT | constants.O_WRONLY;
    await writeFile(manifest_path, JSON.stringify(data), { flag, encoding: "ascii", flush: true });
    await writeFile(this._current_path, id + "", { flag, encoding: "ascii", flush: true });

    this._current_manifest_id = id;
    this._current_manifest = data;
  }
}
