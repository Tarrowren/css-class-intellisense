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

export class IndexedDBSymbolStorage implements SymbolStorage {
  private readonly _queue = new Map<string, Action>();

  constructor(private readonly _db: IDBDatabase) {}

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
    const trans = this._db.transaction(IndexedDBSymbolStorage._store, "readonly");
    const store = trans.objectStore(IndexedDBSymbolStorage._store);

    return await new Promise<Map<DocumentUri, SourceFile>>((c, e) => {
      trans.onerror = () => e(trans.error);

      const data = new Map<DocumentUri, SourceFile>();
      const cursor = store.openCursor();
      cursor.onerror = () => e(cursor.error);
      cursor.onsuccess = () => {
        if (!cursor.result) {
          return c(data);
        }

        if (typeof cursor.result.key === "string" && cursor.result.value instanceof Uint8Array) {
          try {
            const value = typia.protobuf.assertDecode<SourceFile>(cursor.result.value);
            data.set(cursor.result.key, value);
          } catch (_err) {
            // ignore
          }
        }

        cursor.result.continue();
      };
    });
  }

  async close(): Promise<void> {
    clearTimeout(this._timer);
    try {
      await this._save();
    } catch (_err) {
      // ignore
    }

    this._db.close();
  }

  private _timer: number | undefined;
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

    const trans = this._db.transaction(IndexedDBSymbolStorage._store, "readwrite");
    const store = trans.objectStore(IndexedDBSymbolStorage._store);

    for (const [uri, active] of this._queue) {
      switch (active.type) {
        case ActionType.Save:
          store.put(active.value, uri);
          break;
        case ActionType.Delete:
          store.delete(uri);
          break;
      }
    }
    this._queue.clear();

    return await new Promise<void>((c, e) => {
      trans.onerror = () => e(trans.error);
      trans.oncomplete = () => c();
    });
  }

  static async create(name: string) {
    const db = await this.openDatabase(name);
    return new IndexedDBSymbolStorage(db);
  }

  private static readonly _version = 1;
  private static readonly _store = "fileSymbols";

  static async openDatabase(name: string): Promise<IDBDatabase> {
    const req = indexedDB.open(name, this._version);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (db.objectStoreNames.contains(this._store)) {
        db.deleteObjectStore(this._store);
      }
      db.createObjectStore(this._store);
    };
    const db = await new Promise<IDBDatabase>((c, e) => {
      req.onerror = () => e(req.error);
      req.onsuccess = () => c(req.result);
    });

    if (db.objectStoreNames.contains(this._store)) {
      return db;
    }

    db.close();

    await this.deleteDatabase(name);
    return await this.openDatabase(name);
  }

  static async deleteDatabase(name: string): Promise<void> {
    const req = indexedDB.deleteDatabase(name);
    await new Promise<void>((c, e) => {
      req.onerror = () => e(req.error);
      req.onsuccess = () => c();
    });
  }
}
