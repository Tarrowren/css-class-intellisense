import { CancellationError } from "@cci/server-common/src/cancellation";
import type { SymbolStorage } from "@cci/server-common/src/symbol-storage";
import type { SourceFile } from "@cci/server-common/src/type";
import { Bitcask } from "bitcask";
import { resolve } from "node:path";
import typia from "typia";
import type { CancellationToken, DocumentUri } from "vscode-languageserver";

export class FileSymbolStorage implements SymbolStorage {
  private _timer: NodeJS.Timeout | undefined = undefined;

  constructor(private readonly _db: Bitcask) {
    this._merge(300_000);
  }

  insert(uri: DocumentUri, info: SourceFile): void {
    const u8array = typia.protobuf.encode<SourceFile>(info);
    this._db.put(uri, Buffer.from(u8array.buffer, u8array.byteOffset, u8array.byteLength));
  }

  delete(uris: Set<DocumentUri>): void {
    for (const uri of uris) {
      this._db.delete(uri);
    }
  }

  async *entries(token: CancellationToken): AsyncGenerator<[DocumentUri, SourceFile]> {
    for await (const [k, v] of this._db.entries()) {
      if (token.isCancellationRequested) {
        throw new CancellationError();
      }

      const value = typia.protobuf.isDecode<SourceFile>(v);
      if (value) {
        yield [k, value];
      }
    }
  }

  async close(): Promise<void> {
    clearTimeout(this._timer);
    await this._db.dispose();
  }

  static create(name: string, path: string): FileSymbolStorage {
    return new FileSymbolStorage(
      new Bitcask(resolve(path, name)).on("error", (err) => {
        console.error("[Bitcask]", err);
      }),
    );
  }

  private _merge(ms: number): void {
    this._timer = setTimeout(async () => {
      try {
        await this._db.merge();
      } catch (_) {
        // ignore
      } finally {
        this._merge(1_800_000);
      }
    }, ms);
  }
}
