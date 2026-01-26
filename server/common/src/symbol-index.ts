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
  readonly index = new Map<DocumentUri, SourceFile>();

  private readonly _external = new Set<DocumentUri>();
  private readonly _syncQueue = new Queue<DocumentUri>();
  private readonly _asyncInitQueue = new Queue<DocumentUri>();
  private readonly _source = new CancellationTokenSource();

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

  private _currentUpdate: Promise<void> | null = null;

  async update(): Promise<void> {
    await this._currentUpdate;
    const uris = this._syncQueue.consume(undefined, (_uri) => true);
    this._currentUpdate = this._doUpdate(uris, false);
    return this._currentUpdate;
  }

  private async _doUpdate(uris: string[], async: boolean): Promise<void> {
    try {
      if (uris.length === 0) {
        return;
      }

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

      logger.info(
        `[Symbol Index] (${async ? "Async" : "Sync"}) added ${uris.length} files ${sw.elapsed(2)}ms (retrieval: ${totalRetrieve.toFixed(2)}ms, indexing: ${totalIndex.toFixed(2)}ms)`,
      );
    } finally {
      this._currentUpdate = null;
    }
  }

  private _createIndexTask(
    uri: string,
  ): () => Promise<{ readonly durationRetrieve: number; readonly durationIndex: number }> {
    return async () => {
      // fetch document
      const _retrieve_time = StopWatch.create();
      const document = await this._documents.retrieve(uri);
      const durationRetrieve = _retrieve_time.elapsed();

      // update index
      const _index_time = StopWatch.create();
      try {
        await this._doIndex(document);
      } catch (e) {
        logger.warn(`[Symbol Index] FAILED to index ${uri} ${e}`);
      }
      const durationIndex = _index_time.elapsed();

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
    const uris = new Set(_uris);
    const sw = StopWatch.create();

    logger.info(`[Symbol Index] initializing index for ${uris.size} files.`);
    const persisted = await this._storage.getAll();
    const obsolete = new Set<string>();

    for (const [uri, sourceFile] of persisted) {
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

    logger.info(
      `[Symbol Index] added FROM CACHE ${persisted.size} files ${sw.elapsed(2)}ms, all need revalidation, ${uris.size} files are NEW, ${obsolete.size} where OBSOLETE`,
    );

    await this.update();

    for (;;) {
      if (this._source.token.isCancellationRequested) {
        break;
      }

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
    this._source.cancel();
    this._syncQueue.dispose();
    this._asyncInitQueue.dispose();
    this._external.clear();
  }
}
