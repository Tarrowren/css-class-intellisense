import { CustomMessages } from "@cci/shared";
import type { ChangedRange } from "@lezer/common";
import {
  CancellationTokenSource,
  Emitter,
  LRUCache,
  type CancellationToken,
  type Connection,
  type DidChangeTextDocumentParams,
  type DidCloseTextDocumentParams,
  type DidOpenTextDocumentParams,
  type Disposable,
  type DocumentUri,
  type Event,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";
import { CancellationError } from "./cancellation";
import type { Configuration } from "./configuration";
import { fs, os } from "./env";
import type { Languages } from "./languages";
import { Semaphore } from "./semaphore";
import { changedRange, normalize } from "./util";

export interface TextDocumentOpenEvent {
  readonly uri: DocumentUri;
  readonly version: number;
}

export interface TextDocumentChangeEvent {
  readonly uri: DocumentUri;
  readonly version: number;
  readonly changes: ReadonlyArray<ChangedRange>;
}

export interface TextDocumentCloseEvent {
  readonly uri: DocumentUri;
}

export class DocumentStore implements Disposable {
  private readonly _synced = new Map<DocumentUri, TextDocument>();
  private readonly _requests = new Map<DocumentUri, DocumentRequest>();
  private readonly _cache = new LRUCache<DocumentUri, TextDocument>(256);

  private readonly _decoder = new TextDecoder();

  private readonly _semaphore = new Semaphore(os().concurrency);

  private readonly _onDidOpen = new Emitter<TextDocumentOpenEvent>();
  private readonly _onDidChangeContent = new Emitter<TextDocumentChangeEvent>();
  private readonly _onDidClose = new Emitter<TextDocumentCloseEvent>();

  constructor(
    private readonly _configuration: Configuration,
    private readonly _connection: Connection,
    private readonly _languages: Languages,
  ) {
    _connection.onDidOpenTextDocument(this._onOpen.bind(this));
    _connection.onDidChangeTextDocument(this._onChange.bind(this));
    _connection.onDidCloseTextDocument(this._onClose.bind(this));
  }

  get onDidOpen(): Event<TextDocumentOpenEvent> {
    return this._onDidOpen.event;
  }

  get onDidChangeContent(): Event<TextDocumentChangeEvent> {
    return this._onDidChangeContent.event;
  }

  get onDidClose(): Event<TextDocumentCloseEvent> {
    return this._onDidClose.event;
  }

  dispose(): void {
    this._onDidOpen.dispose();
    this._onDidChangeContent.dispose();
    this._onDidClose.dispose();

    this._semaphore.dispose();

    this._synced.clear();
    for (const request of this._requests.values()) {
      request.source.cancel();
    }
    this._requests.clear();
    this._cache.clear();
  }

  has(documentUri: DocumentUri): boolean {
    return this._synced.has(documentUri);
  }

  get(documentUri: DocumentUri): TextDocument | undefined {
    return this._synced.get(documentUri);
  }

  async retrieve(documentUri: DocumentUri, token: CancellationToken): Promise<TextDocument> {
    if (token.isCancellationRequested) {
      throw new CancellationError();
    }

    const document = this._synced.get(documentUri) ?? this._cache.get(documentUri);
    if (document) {
      return document;
    }

    let request = this._requests.get(documentUri);
    if (!request) {
      request = this._createRequest(documentUri, token);
      this._requests.set(documentUri, request);
    } else if (!request.tokens.has(token)) {
      request.subscriptions.push(this._cancel(documentUri, token));
      request.tokens.add(token);
    }
    const maybeExpired = await request.value;
    return this._synced.get(documentUri) ?? maybeExpired;
  }

  removeFile(documentUri: DocumentUri): boolean {
    const request = this._requests.get(documentUri);
    if (request) {
      request.source.cancel();
      this._cache.delete(documentUri);
      return true;
    }

    return this._cache.delete(documentUri);
  }

  private _createRequest(documentUri: DocumentUri, token: CancellationToken): DocumentRequest {
    const source = new CancellationTokenSource();
    const subscriptions: Disposable[] = [this._cancel(documentUri, token)];
    const tokens = new Set<CancellationToken>([token]);
    const value = this._requestDocument(documentUri, source.token)
      .then((value) => {
        this._cache.set(documentUri, value);
        return value;
      })
      .finally(() => {
        if (this._requests.get(documentUri) === request) {
          this._requests.delete(documentUri);
        }

        source.dispose();
        for (const disposable of subscriptions) {
          disposable.dispose();
        }
        tokens.clear();
      });

    const request: DocumentRequest = { source, subscriptions, tokens, value };

    return request;
  }

  private _cancel(documentUri: DocumentUri, token: CancellationToken): Disposable {
    return token.onCancellationRequested(() => {
      const request = this._requests.get(documentUri);
      if (request && request.tokens.delete(token)) {
        for (const t of request.tokens) {
          if (!t.isCancellationRequested) {
            return;
          }
        }

        request.source.cancel();
      }
    });
  }

  private async _requestDocument(documentUri: DocumentUri, token: CancellationToken): Promise<TextDocument> {
    const languageId = this._languages.getLanguageIdByUri(documentUri);

    const f = fs();
    const uri = URI.parse(documentUri);

    let content: string;
    if (uri.scheme === "http" || uri.scheme === "https") {
      content = await f.fetchFile(documentUri, token);
    } else if (uri.scheme === "file" && this._configuration.useNodeFS && f.readFile) {
      const bytes = await f.readFile(uri.fsPath, token);
      content = this._decoder.decode(bytes);
    } else {
      const elements = await this._semaphore.lock(
        () => this._connection.sendRequest(CustomMessages.FileRead, documentUri, token),
        token,
      );
      const bytes = new Uint8Array(elements);
      content = this._decoder.decode(bytes);
    }

    return TextDocument.create(documentUri, languageId, 1, content);
  }

  private _onOpen({ textDocument: { uri, languageId, version, text } }: DidOpenTextDocumentParams) {
    const documentUri = normalize(uri);

    const document = TextDocument.create(documentUri, languageId, version, text);

    this._synced.set(documentUri, document);
    this._onDidOpen.fire({ uri: documentUri, version });
  }

  private _onChange({ textDocument: { uri, version }, contentChanges }: DidChangeTextDocumentParams) {
    const documentUri = normalize(uri);

    const prev = this._synced.get(documentUri);
    if (!prev) {
      return;
    }

    const changes = changedRange(prev, contentChanges);
    const document = TextDocument.update(prev, contentChanges, version);

    this._synced.set(documentUri, document);
    this._onDidChangeContent.fire({
      uri: documentUri,
      version,
      changes,
    });
  }

  private _onClose({ textDocument: { uri } }: DidCloseTextDocumentParams) {
    const documentUri = normalize(uri);

    this._synced.delete(documentUri);
    this._onDidClose.fire({ uri: documentUri });
  }
}

interface DocumentRequest {
  readonly source: CancellationTokenSource;
  readonly subscriptions: Disposable[];
  readonly tokens: Set<CancellationToken>;
  readonly value: Promise<TextDocument>;
}
