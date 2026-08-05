import { LockType, ReadWriteLock } from "@cci/shared";
import { CancellationTokenSource, DocumentUri, type Disposable } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type { Configuration } from "./configuration";
import type { DocumentStore } from "./document-store";
import type { Languages } from "./languages";
import { StopWatch } from "./stop-watch";
import type { SymbolStorage } from "./symbol-storage";
import type { Trees } from "./trees";
import type { SourceFile } from "./type";
import { parallel, Queue } from "./util";

export class SymbolIndex implements Disposable {
  readonly index: Map<string, SourceFile> = new Map();

  private readonly _external = new Set<DocumentUri>();
  private readonly _syncQueue = new Queue<DocumentUri>();
  private readonly _asyncInitQueue = new Queue<DocumentUri>();
  private readonly _source = new CancellationTokenSource();
  private readonly _rwlock = new ReadWriteLock();

  constructor(
    private readonly _configuration: Configuration,
    private readonly _documents: DocumentStore,
    private readonly _languages: Languages,
    private readonly _trees: Trees,
    private readonly _storage: SymbolStorage,
  ) {}

  addFile(uri: string): void {
    this._syncQueue.enqueue(uri);
    this._asyncInitQueue.dequeue(uri);
  }

  removeFile(uri: string): void {
    this._syncQueue.dequeue(uri);
    this._asyncInitQueue.dequeue(uri);
    this.index.delete(uri);
  }

  async update(): Promise<void> {
    const lk = this._rwlock.get(LockType.WRITE);
    await lk.lock();
    try {
      const uris = this._syncQueue.consume(undefined, (_uri) => true);
      if (uris.length === 0) {
        return;
      }

      await this._doUpdate(uris, false);
    } finally {
      lk.unlock();
    }
  }

  private async _doUpdate(uris: string[], async: boolean): Promise<void> {
    const sw = StopWatch.create();
    const tasks = uris.map(this._createIndexTask, this);
    const stats = await parallel(tasks, this._configuration.parallel, this._source.token);

    let totalRetrieve = 0;
    let totalIndex = 0;
    for (const stat of stats) {
      totalRetrieve += stat.durationRetrieve;
      totalIndex += stat.durationIndex;
    }

    if (this._external.size > 0) {
      const tasks = [...this._external].map(this._createIndexTask, this);
      this._external.clear();
      const stats = await parallel(tasks, this._configuration.parallel, this._source.token);
      for (const stat of stats) {
        totalRetrieve += stat.durationRetrieve;
        totalIndex += stat.durationIndex;
      }
    }

    console.info(
      "[Symbol Index]",
      async ? "(Async)" : "(Sync)",
      "added",
      uris.length,
      "files",
      sw.elapsed(2),
      "( retrieval:",
      totalRetrieve.toFixed(2),
      ", indexing:",
      totalIndex.toFixed(2),
      ")",
    );
  }

  private _createIndexTask(
    uri: string,
  ): () => Promise<{ readonly durationRetrieve: number; readonly durationIndex: number }> {
    return async () => {
      // fetch document
      let document: TextDocument | undefined;
      const _retrieve_time = StopWatch.create();
      try {
        document = await this._documents.retrieve(uri);
      } catch (e) {
        console.warn("[Symbol Index] FAILED to get", uri, e);
      }
      const durationRetrieve = _retrieve_time.elapsed();

      // update index
      let durationIndex: number;
      if (document) {
        const _index_time = StopWatch.create();
        try {
          await this._doIndex(document);
        } catch (e) {
          console.warn("[Symbol Index] FAILED to index", uri, e);
        }
        durationIndex = _index_time.elapsed();
      } else {
        durationIndex = 0;
      }

      return { durationRetrieve, durationIndex };
    };
  }

  private async _doIndex(document: TextDocument): Promise<void> {
    const language = this._languages.getLanguage(document.languageId);
    if (!language) {
      return;
    }

    const tree = await this._trees.getParseTree(document, language);
    const uri = document.uri;

    const sourceFile = language.query(uri, document.getText(), tree);
    for (const [href] of sourceFile.refs) {
      if (!this.index.has(href)) {
        this._external.add(href);
      }
    }

    this.index.set(uri, sourceFile);
    this._storage.insert(uri, sourceFile);
  }

  async initFiles(_uris: ReadonlyArray<DocumentUri>): Promise<void> {
    this.index.clear();
    const uris = new Set(_uris);
    const sw = StopWatch.create();

    console.info("[Symbol Index] initializing index for", uris.size, "files.");
    const obsolete = new Set<string>();

    let size = 0;
    for await (const [uri, sourceFile] of this._storage.entries(this._source.token)) {
      size++;
      if (uris.delete(uri)) {
        this.index.set(uri, sourceFile);
        this._asyncInitQueue.enqueue(uri);
      } else {
        obsolete.add(uri);
      }
    }

    for (const uri of uris) {
      this._syncQueue.enqueue(uri);
    }

    this._storage.delete(obsolete);

    console.info(
      "[Symbol Index] added FROM CACHE",
      size,
      "files",
      sw.elapsed(2),
      ", all need revalidation,",
      uris.size,
      "files are NEW,",
      obsolete.size,
      "where OBSOLETE",
    );

    await this.update();

    while (!this._source.token.isCancellationRequested) {
      const uris = this._asyncInitQueue.consume(this._configuration.parallel, (_uri) => true);
      if (uris.length === 0) {
        break;
      }

      const sw = StopWatch.create();
      await this._doUpdate(uris, true);
      await scheduler.wait(sw.elapsed() * 4, this._source.token);
    }
  }

  dispose(): void {
    this._rwlock.dispose();
    this._source.cancel();
    this._syncQueue.dispose();
    this._asyncInitQueue.dispose();
    this._external.clear();
  }
}
