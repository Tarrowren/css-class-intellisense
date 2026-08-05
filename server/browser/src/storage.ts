import type { SymbolStorage } from "@cci/server-common/src/symbol-storage";
import type { SourceFile } from "@cci/server-common/src/type";
import typia from "typia";
import type { CancellationToken, DocumentUri } from "vscode-languageserver";

export class IndexedDBSymbolStorage implements SymbolStorage {
  private static readonly _version = 1;
  private static readonly _store = "fileSymbols";
  private readonly _queue = new Map<string, Action>();
  private _timer: number | undefined;

  constructor(private readonly _db: IDBDatabase) {}

  insert(uri: DocumentUri, info: SourceFile): void {
    this._queue.set(uri, { type: ActionType.PUT, value: typia.protobuf.encode<SourceFile>(info) });
    this._save_soon();
  }

  delete(uris: Set<DocumentUri>): void {
    for (const uri of uris) {
      this._queue.set(uri, { type: ActionType.DEL, value: null });
    }
    this._save_soon();
  }

  async *entries(token: CancellationToken): AsyncGenerator<[DocumentUri, SourceFile]> {
    const trans = this._db.transaction(IndexedDBSymbolStorage._store, "readonly");
    const store = trans.objectStore(IndexedDBSymbolStorage._store);

    const request = store.openCursor();

    let cursor: IDBCursorWithValue | null;
    while ((cursor = await _get(request))) {
      if (token.isCancellationRequested) {
        throw new Error("canceled");
      }
      if (trans.error) {
        throw trans.error;
      }

      if (typeof cursor.key === "string" && cursor.value instanceof Uint8Array) {
        const value = typia.protobuf.isDecode<SourceFile>(cursor.value);
        if (value) {
          yield [cursor.key, value];
        }
      }

      cursor.continue();
    }
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

  static async create(name: string): Promise<IndexedDBSymbolStorage> {
    const db = await this.openDatabase(name);
    return new IndexedDBSymbolStorage(db);
  }

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

  private _save_soon(): void {
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
        case ActionType.PUT:
          store.put(active.value, uri);
          break;
        case ActionType.DEL:
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
}

enum ActionType {
  PUT,
  DEL,
}

type Action = PutActive | DelActive;
interface PutActive {
  type: ActionType.PUT;
  value: Uint8Array;
}
interface DelActive {
  type: ActionType.DEL;
  value: null;
}

async function _get(cursor: IDBRequest<IDBCursorWithValue | null>): Promise<IDBCursorWithValue | null> {
  let resolve: (value: IDBCursorWithValue | null) => void;
  let reject: (reason?: unknown) => void;
  const promise = new Promise<IDBCursorWithValue | null>((c, e) => {
    resolve = c;
    reject = e;
  });

  const _success = () => resolve(cursor.result);
  const _error = () => reject(cursor.error);

  cursor.addEventListener("success", _success, { once: true });
  cursor.addEventListener("error", _error, { once: true });
  try {
    return await promise;
  } finally {
    cursor.removeEventListener("success", _success);
    cursor.removeEventListener("error", _error);
  }
}
