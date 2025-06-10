import type { Disposable, DocumentUri } from "vscode-languageserver";
import { Empty } from "./empty";
import type { SourceFile } from "./type";

export interface SymbolStorage extends Disposable {
  insert(uri: DocumentUri, info: SourceFile): void;
  delete(uris: Set<DocumentUri>): void;
  getAll(): Promise<Map<DocumentUri, SourceFile>>;
}

export class NoopSymbolStorage implements SymbolStorage {
  insert(_uri: DocumentUri, _info: SourceFile): void {}

  delete(_uris: Set<DocumentUri>): void {}

  async getAll(): Promise<Map<DocumentUri, SourceFile>> {
    return Empty.map();
  }

  dispose(): void {}
}
