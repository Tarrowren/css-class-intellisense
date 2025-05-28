import type { Disposable } from "vscode-languageserver";
import type { DocumentUri } from "vscode-languageserver-textdocument";
import type { SourceFile } from "./type";

export interface SymbolStorage extends Disposable {
  insert(uri: DocumentUri, info: SourceFile): void;
  getAll(): Promise<Map<DocumentUri, SourceFile>>;
  delete(uris: Set<DocumentUri>): Promise<void>;
}

export class MemorySymbolStorage implements SymbolStorage {
  private readonly _cache = new Map<string, SourceFile>();

  insert(uri: string, info: SourceFile): void {
    this._cache.set(uri, info);
  }

  async getAll(): Promise<Map<string, SourceFile>> {
    return this._cache;
  }

  async delete(uris: Set<string>): Promise<void> {
    for (const uri of uris) {
      this._cache.delete(uri);
    }
  }

  dispose(): void {
    this._cache.clear();
  }
}
