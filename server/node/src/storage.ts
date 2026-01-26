import { resolve } from "node:path";
import type { SymbolStorage } from "server-common/src/symbol-storage";
import type { SourceFile } from "server-common/src/type";
import typia from "typia";
import type { DocumentUri } from "vscode-languageserver";
import { open_db, type Bitcask } from "./bitcask";

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

  constructor(private readonly _db: Bitcask) {
    this._merge();
  }

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
    const data = new Map<DocumentUri, SourceFile>();

    const entries = this._db.entries();
    for await (const [k, v] of entries) {
      try {
        const value = typia.protobuf.assertDecode<SourceFile>(v);
        data.set(k, value);
      } catch (_err) {
        // ignore
      }
    }

    return data;
  }

  async close(): Promise<void> {
    clearTimeout(this._timer);
    clearTimeout(this._merge_timer);
    try {
      await this._save();
    } catch (_err) {
      // ignore
    }

    await this._db.close();
  }

  private _timer: NodeJS.Timeout | undefined;
  private _save_soon() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => {
      this._save();
    }, 1000);
  }

  private async _save(): Promise<void> {
    if (this._queue.size === 0) {
      return;
    }

    const tasks = new Array<Promise<void>>(this._queue.size);
    let i = 0;
    for (const [uri, active] of this._queue) {
      switch (active.type) {
        case ActionType.Save:
          tasks[i] = this._db.put(
            uri,
            Buffer.from(active.value.buffer, active.value.byteOffset, active.value.byteLength),
          );
          break;
        case ActionType.Delete:
          tasks[i] = this._db.delete(uri);
          break;
      }

      i++;
    }
    this._queue.clear();

    await Promise.all(tasks);
  }

  private _merge_timer: NodeJS.Timeout | undefined = undefined;
  _merge(): void {
    this._merge_timer = setTimeout(async () => {
      await this._db.merge();
      this._merge();
    }, 60_000);
  }

  static async create(name: string, path: string): Promise<FileSymbolStorage> {
    const db = await open_db(resolve(path, name));
    return new FileSymbolStorage(db);
  }
}
