import type { DocumentUri } from "vscode-languageserver";
import { Empty } from "./empty";
import type { SourceFile } from "./type";

export interface SymbolStorage {
  insert(uri: DocumentUri, info: SourceFile): void;
  delete(uris: Set<DocumentUri>): void;
  getAll(): Promise<Map<DocumentUri, SourceFile>>;
  close(): Promise<void>;
}

export class NoopSymbolStorage implements SymbolStorage {
  insert(_uri: DocumentUri, _info: SourceFile): void {}

  delete(_uris: Set<DocumentUri>): void {}

  async getAll(): Promise<Map<DocumentUri, SourceFile>> {
    return Empty.map();
  }

  async close(): Promise<void> {}
}
