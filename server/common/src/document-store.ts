import { CustomMessages } from "@cci/shared";
import type { ChangedRange } from "@lezer/common";
import {
  CancellationTokenSource,
  Emitter,
  LRUCache,
  TextDocumentContentChangeEvent,
  type CancellationToken,
  type Connection,
  type Disposable,
  type DocumentUri,
  type Event,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";
import { CancellationError } from "./cancellation";
import type { Configuration } from "./configuration";
import { Empty } from "./empty";
import { fs, os } from "./env";
import type { Languages } from "./languages";
import { Semaphore } from "./semaphore";
import { normalize } from "./util";

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
  private readonly _files = new LRUCache<DocumentUri, TextDocument>(256);

  private readonly _decoder = new TextDecoder();

  private readonly _semaphore = new Semaphore(os().concurrency);

  private readonly _on_did_open = new Emitter<TextDocumentOpenEvent>();
  private readonly _on_did_change_content = new Emitter<TextDocumentChangeEvent>();
  private readonly _on_did_close = new Emitter<TextDocumentCloseEvent>();

  constructor(
    private readonly _configuration: Configuration,
    private readonly _connection: Connection,
    private readonly _languages: Languages,
  ) {
    _connection.onDidOpenTextDocument(({ textDocument: { uri, languageId, version, text } }) => {
      const documentUri = normalize(uri);
      const document = TextDocument.create(documentUri, languageId, version, text);

      this._synced.set(documentUri, document);
      this._on_did_open.fire({ uri: documentUri, version });
      this._on_did_change_content.fire({ uri: documentUri, version, changes: Empty.array() });
    });

    _connection.onDidChangeTextDocument(({ textDocument: { uri, version }, contentChanges }) => {
      if (contentChanges.length === 0) {
        return;
      }

      const documentUri = normalize(uri);

      const prev = this._synced.get(documentUri);
      if (!prev) {
        return;
      }

      const document = TextDocument.update(prev, contentChanges, version);

      this._synced.set(documentUri, document);
      this._on_did_change_content.fire({
        uri: documentUri,
        version,
        changes: contentChanges
          .filter(TextDocumentContentChangeEvent.isIncremental)
          .map<ChangedRange>(({ range, rangeLength, text }) => {
            const from = prev.offsetAt(range.start);
            return {
              fromA: from,
              toA: rangeLength ? from + rangeLength : prev.offsetAt(range.end),
              fromB: from,
              toB: from + text.length,
            };
          }),
      });
    });

    _connection.onDidCloseTextDocument(({ textDocument: { uri } }) => {
      const documentUri = normalize(uri);

      if (!this._synced.has(documentUri)) {
        return;
      }

      this._synced.delete(documentUri);
      this._on_did_close.fire({ uri: documentUri });
    });
  }

  get onDidOpen(): Event<TextDocumentOpenEvent> {
    return this._on_did_open.event;
  }

  get onDidChangeContent(): Event<TextDocumentChangeEvent> {
    return this._on_did_change_content.event;
  }

  get onDidClose(): Event<TextDocumentCloseEvent> {
    return this._on_did_close.event;
  }

  dispose(): void {
    this._on_did_open.dispose();
    this._on_did_change_content.dispose();
    this._on_did_close.dispose();

    this._semaphore.dispose();

    this._synced.clear();
    for (const request of this._requests.values()) {
      request.source.cancel();
    }
    this._requests.clear();
    this._files.clear();
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

    const document = this._synced.get(documentUri) ?? this._files.get(documentUri);
    if (document) {
      return document;
    }

    let request = this._requests.get(documentUri);
    if (!request) {
      request = this._create_request(documentUri, token);
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
      this._files.delete(documentUri);
      return true;
    }

    return this._files.delete(documentUri);
  }

  private _create_request(documentUri: DocumentUri, token: CancellationToken): DocumentRequest {
    const source = new CancellationTokenSource();
    const subscriptions: Disposable[] = [this._cancel(documentUri, token)];
    const tokens = new Set<CancellationToken>([token]);
    const value = this._request_document(documentUri, source.token)
      .then((value) => {
        this._files.set(documentUri, value);
        return value;
      })
      .finally(() => {
        this._requests.delete(documentUri);

        source.dispose();
        for (const disposable of subscriptions) {
          disposable.dispose();
        }
        tokens.clear();
      });

    return {
      source,
      subscriptions,
      tokens,
      value,
    };
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

  private async _request_document(documentUri: DocumentUri, token: CancellationToken): Promise<TextDocument> {
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
}

interface DocumentRequest {
  readonly source: CancellationTokenSource;
  readonly subscriptions: Disposable[];
  readonly tokens: Set<CancellationToken>;
  readonly value: Promise<TextDocument>;
}
