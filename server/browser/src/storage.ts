import type { SymbolStorage } from "server-common/src/symbol-storage";
import type { SourceFile } from "server-common/src/type";
import typia from "typia";
import type { DocumentUri } from "vscode-languageserver";

export class IndexedDBSymbolStorage implements SymbolStorage {
  private readonly _insert_queue = new Map<string, Uint8Array>();
  private readonly _delete_queue = new Set<string>();

  constructor(private readonly _db: IDBDatabase) {}

  insert(uri: DocumentUri, info: SourceFile): void {
    this._insert_queue.set(uri, typia.protobuf.encode<SourceFile>(info));
    this._insert_soon();
  }

  delete(uris: Set<DocumentUri>): void {
    for (const uri of uris) {
      this._delete_queue.add(uri);
    }
    this._delete_soon();
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

  async dispose(): Promise<void> {
    clearTimeout(this._insert_timer);
    clearTimeout(this._delete_timer);
    await this._insert();
    await this._delete();
    this._db.close();
  }

  private _insert_timer: number | undefined;
  private _insert_soon() {
    clearTimeout(this._insert_timer);
    this._insert_timer = setTimeout(() => {
      this._insert();
    }, 500);
  }

  private _delete_timer: number | undefined;
  private _delete_soon() {
    clearTimeout(this._delete_timer);
    this._delete_timer = setTimeout(() => {
      this._delete();
    }, 500);
  }

  private async _insert(): Promise<void> {
    if (this._insert_queue.size === 0) {
      return;
    }

    const trans = this._db.transaction(IndexedDBSymbolStorage._store, "readwrite");
    const store = trans.objectStore(IndexedDBSymbolStorage._store);

    for (const [uri, sourceFile] of this._insert_queue) {
      store.put(sourceFile, uri);
    }
    this._insert_queue.clear();

    return await new Promise<void>((c, e) => {
      trans.onerror = () => e(trans.error);
      trans.oncomplete = () => c();
    });
  }

  private async _delete(): Promise<void> {
    if (this._delete_queue.size === 0) {
      return;
    }

    const trans = this._db.transaction(IndexedDBSymbolStorage._store, "readwrite");
    const store = trans.objectStore(IndexedDBSymbolStorage._store);

    for (const uri of this._delete_queue) {
      store.delete(uri);
    }
    this._delete_queue.clear();

    return await new Promise<void>((c, e) => {
      trans.onerror = () => e(trans.error);
      trans.oncomplete = () => c();
    });
  }

  private static readonly _version = 1;
  private static readonly _store = "fileSymbols";

  static async create(name: string) {
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
}
