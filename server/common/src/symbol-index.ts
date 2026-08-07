import { UnsafeNode, UnsafeQueue, withResolvers } from "@cci/shared";
import { CancellationTokenSource, DocumentUri, type CancellationToken, type Disposable } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { CancellationError } from "./cancellation";
import type { DocumentStore } from "./document-store";
import { os, scheduler } from "./env";
import type { Languages } from "./languages";
import { StopWatch } from "./stop-watch";
import type { SymbolStorage } from "./symbol-storage";
import type { Trees } from "./trees";
import type { SourceFile } from "./type";

export class SymbolIndex implements Disposable {
  readonly index: Map<DocumentUri, SourceFile> = new Map();

  private _source: CancellationTokenSource | null | undefined;

  private readonly _immediate_files = new FileQueue();
  private readonly _lazy_files = new FileQueue();
  private _immediate_files_active = 0;
  private _files_active = 0;
  private readonly _queue = new UnsafeQueue<Executor>();

  constructor(
    private readonly _documents: DocumentStore,
    private readonly _languages: Languages,
    private readonly _trees: Trees,
    private readonly _storage: SymbolStorage,
  ) {}

  dispose(): void {
    this._source?.cancel();
    this._source = null;

    let node: UnsafeNode<Executor> | null | undefined;
    while ((node = this._queue.shift())) {
      node.value.reject(new CancellationError());
    }

    this._immediate_files.clear();
    this._lazy_files.clear();
    this._immediate_files_active = 0;
    this._files_active = 0;
  }

  addFile(uri: DocumentUri): void {
    this._immediate_files.push(uri);
    this._lazy_files.delete(uri);
  }

  removeFile(uri: DocumentUri): void {
    this._immediate_files.delete(uri);
    this._lazy_files.delete(uri);
    this.index.delete(uri);
  }

  async update(token: CancellationToken): Promise<void> {
    if (token.isCancellationRequested) {
      throw new CancellationError();
    }

    const { promise, resolve, reject } = withResolvers<void>();

    const node = new UnsafeNode<Executor>({ resolve, reject });
    this._queue.push(node);

    const disposable = token.onCancellationRequested(() => {
      reject(new CancellationError());
      this._queue.remove(node);
    });

    if (this._source) {
      this._next(this._source.token);
    }

    try {
      const sw = StopWatch.create();
      await promise;
      console.info("[SymbolIndex] update index time", sw.elapsed(2));
    } finally {
      disposable.dispose();
    }
  }

  async initFiles(documentUris: ReadonlyArray<DocumentUri>, token: CancellationToken): Promise<void> {
    this._source?.cancel();
    this._source = null;
    try {
      this.index.clear();
      this._immediate_files.clear();
      this._lazy_files.clear();

      const uris = new Set(documentUris);
      console.info("[SymbolIndex] initializing index for", uris.size, "files.");

      const sw = StopWatch.create();

      const obsolete = new Set<string>();

      let size = 0;
      for await (const [uri, sourceFile] of this._storage.entries(token)) {
        size++;

        if (uris.delete(uri)) {
          this.index.set(uri, sourceFile);
          this._lazy_files.push(uri);
        } else {
          obsolete.add(uri);
        }
      }

      for (const uri of uris) {
        this._immediate_files.push(uri);
      }

      this._storage.delete(obsolete);

      console.info(
        "[SymbolIndex] added FROM CACHE",
        size,
        "files",
        sw.elapsed(2) + ", all need revalidation,",
        uris.size,
        "files are NEW,",
        obsolete.size,
        "where OBSOLETE",
      );
    } finally {
      this._source = new CancellationTokenSource();
      this._next(this._source.token);
    }
  }

  private _next(token: CancellationToken) {
    scheduler()
      .yield(token)
      .then(() => {
        let uri: DocumentUri | undefined;
        while (this._files_active < os().concurrency && (uri = this._immediate_files.shift())) {
          this._immediate_files_active++;
          this._files_active++;

          this._update_index(false, uri, token).finally(() => {
            this._immediate_files_active--;
            this._files_active--;

            this._next(token);
          });
        }

        if (this._immediate_files_active === 0) {
          let node: UnsafeNode<Executor> | null | undefined;
          while ((node = this._queue.shift())) {
            node.value.resolve();
          }

          while (this._files_active < os().concurrency && (uri = this._lazy_files.shift())) {
            this._files_active++;

            this._update_index(true, uri, token).finally(() => {
              this._files_active--;

              this._next(token);
            });
          }
        }
      })
      .catch((_) => {
        // ignore
      });
  }

  private async _update_index(lazy: boolean, uri: DocumentUri, token: CancellationToken): Promise<void> {
    // fetch document
    let document: TextDocument | undefined;
    try {
      // const sw = StopWatch.create();
      document = await this._documents.retrieve(uri, token);
      // console.debug("[SymbolIndex] retrieve time", uri, sw.elapsed(2));
    } catch (e) {
      console.warn("[SymbolIndex] FAILED to retrieve", uri, e);
    }

    // update index
    if (document) {
      try {
        // const sw = StopWatch.create();
        await this._do_index(lazy, document, token);
        // console.debug("[SymbolIndex] index time", uri, sw.elapsed(2));
      } catch (e) {
        console.warn("[SymbolIndex] FAILED to index", uri, e);
      }
    }
  }

  private async _do_index(lazy: boolean, maybeExpired: TextDocument, token: CancellationToken): Promise<void> {
    const language = this._languages.getLanguage(maybeExpired.languageId);
    if (!language) {
      return;
    }

    const uri = maybeExpired.uri;
    const { document, tree } = await this._trees.getParseTree(maybeExpired, language, token);
    const sourceFile = language.query(uri, document.getText(), tree);
    for (const href of sourceFile.refs.keys()) {
      if (!this.index.has(href) && (!lazy || !this._lazy_files.has(href))) {
        this._immediate_files.push(href);
      }
    }

    this.index.set(uri, sourceFile);
    this._storage.insert(uri, sourceFile);
  }
}

class FileQueue {
  private readonly _set = new Set<DocumentUri>();

  clear(): void {
    this._set.clear();
  }

  push(uri: DocumentUri): void {
    if (!this._set.has(uri)) {
      this._set.add(uri);
    }
  }

  shift(): DocumentUri | undefined {
    for (const uri of this._set) {
      this._set.delete(uri);
      return uri;
    }
  }

  has(uri: DocumentUri): boolean {
    return this._set.has(uri);
  }

  delete(uri: DocumentUri): void {
    this._set.delete(uri);
  }
}

interface Executor {
  resolve: () => void;
  reject: (reason?: unknown) => void;
}
