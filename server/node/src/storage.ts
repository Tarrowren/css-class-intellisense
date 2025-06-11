import { writeFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Empty } from "server-common/src/empty";
import type { SymbolStorage } from "server-common/src/symbol-storage";
import type { SourceFile } from "server-common/src/type";
import typia from "typia";
import type { DocumentUri } from "vscode-languageserver";

export class FileSymbolStorage implements SymbolStorage {
  private readonly _data = new Map<string, Uint8Array>();
  private _changed = false;

  constructor(private readonly _db_path: string) {}

  insert(uri: DocumentUri, info: SourceFile): void {
    this._changed = true;
    this._data.set(uri, typia.protobuf.encode<SourceFile>(info));
    this._save_soon();
  }

  delete(uris: Set<DocumentUri>): void {
    this._changed = true;
    for (const uri of uris) {
      this._data.delete(uri);
    }
    this._save_soon();
  }

  async getAll(): Promise<Map<DocumentUri, SourceFile>> {
    this._data.clear();

    let wrap: _Wrap;
    try {
      const raw = await readFile(this._db_path);
      wrap = typia.protobuf.assertDecode<_Wrap>(raw);
    } catch (_err) {
      return Empty.map();
    }

    const result = new Map<DocumentUri, SourceFile>();
    for (const [uri, raw] of wrap.data) {
      try {
        const info = typia.protobuf.assertDecode<SourceFile>(raw);
        this._data.set(uri, raw);
        result.set(uri, info);
      } catch (_err) {
        // ignore
      }
    }
    return result;
  }

  dispose(): void {
    clearTimeout(this._timer);
    if (this._changed) {
      this._save_sync();
    }
  }

  private _timer: NodeJS.Timeout | undefined;
  private _save_soon() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => {
      this._save();
    }, 500);
  }

  private _serialize() {
    this._changed = false;
    return typia.protobuf.encode<_Wrap>({ data: this._data });
  }

  private async _save() {
    await writeFile(this._db_path, this._serialize());
  }

  private _save_sync() {
    writeFileSync(this._db_path, this._serialize());
  }

  static async create(path: string): Promise<FileSymbolStorage> {
    await mkdir(path, { recursive: true });
    const dbPath = join(path, "anycode.db");
    return new FileSymbolStorage(dbPath);
  }
}

interface _Wrap {
  data: Map<string, Uint8Array>;
}
