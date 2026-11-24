import type { CancellationToken, DocumentUri } from "vscode-languageserver";
import type { SourceFile } from "./type";

export interface SymbolStorage {
  insert(uri: DocumentUri, info: SourceFile): void;
  delete(uris: Set<DocumentUri>): void;
  entries(token: CancellationToken): AsyncGenerator<[DocumentUri, SourceFile]>;
  close(): Promise<void>;
}

export class NoopSymbolStorage implements SymbolStorage {
  insert(_uri: DocumentUri, _info: SourceFile): void {}

  delete(_uris: Set<DocumentUri>): void {}

  async *entries(_token: CancellationToken): AsyncGenerator<[DocumentUri, SourceFile]> {}

  async close(): Promise<void> {}
}
