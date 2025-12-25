import { writeFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Empty } from "server-common/src/empty";
import type { SymbolStorage } from "server-common/src/symbol-storage";
import type { SourceFile } from "server-common/src/type";
import typia from "typia";
import type { DocumentUri } from "vscode-languageserver";

enum ActionType {
  Save,
  Delete,
}

type Action =
  | {
      type: ActionType.Save;
      value: Uint8Array;
    }
  | { type: ActionType.Delete };

export class FileSymbolStorage implements SymbolStorage {
  private readonly _queue = new Map<string, Action>();
  private readonly _data = new Map<string, Uint8Array>();

  constructor(private readonly _db_path: string) {}

  insert(uri: DocumentUri, info: SourceFile): void {
    this._queue.set(uri, { type: ActionType.Save, value: typia.protobuf.encode<SourceFile>(info) });
    this._save_soon();
  }

  delete(uris: Set<DocumentUri>): void {
    for (const uri of uris) {
      this._queue.set(uri, { type: ActionType.Delete });
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
    this._save(true);
  }

  private _timer: NodeJS.Timeout | undefined;
  private _save_soon() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => {
      this._save();
    }, 500);
  }

  private _save(sync = false) {
    if (this._queue.size === 0) {
      return;
    }

    for (const [uri, active] of this._queue) {
      switch (active.type) {
        case ActionType.Save:
          this._data.set(uri, active.value);
          break;
        case ActionType.Delete:
          this._data.delete(uri);
          break;
      }
    }
    this._queue.clear();

    const buf = typia.protobuf.encode<_Wrap>({ data: this._data });
    console.log("[Index] length:", buf.byteLength);

    if (sync) {
      return writeFileSync(this._db_path, buf);
    } else {
      return writeFile(this._db_path, buf);
    }
  }

  static async create(name: string, path: string): Promise<FileSymbolStorage> {
    await mkdir(path, { recursive: true });
    const dbPath = join(path, name + ".db");

    return new FileSymbolStorage(dbPath);
  }
}

interface _Wrap {
  data: Map<string, Uint8Array>;
}
