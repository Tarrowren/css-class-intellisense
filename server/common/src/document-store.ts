import type { ChangedRange } from "@lezer/common";
import { CustomMessages } from "shared";
import {
  Emitter,
  TextDocumentContentChangeEvent,
  type Connection,
  type Disposable,
  type DocumentUri,
  type Event,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Cache } from "./cache";
import { Empty } from "./empty";
import type { Languages } from "./languages";

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
  private readonly _syncedDocuments = new Map<DocumentUri, TextDocument>();

  private readonly _onDidOpen = new Emitter<TextDocumentOpenEvent>();
  private readonly _onDidChangeContent = new Emitter<TextDocumentChangeEvent>();
  private readonly _onDidClose = new Emitter<TextDocumentCloseEvent>();

  private readonly _decoder = new TextDecoder();
  private readonly _fileDocuments = Cache.create<DocumentUri, Promise<TextDocument>>();
  private readonly _subscriptions: Disposable[] = [];

  constructor(
    private readonly _connection: Connection,
    private readonly _languages: Languages,
  ) {
    this._subscriptions.push(
      _connection.onDidOpenTextDocument(({ textDocument: { uri, languageId, version, text } }) => {
        const document = TextDocument.create(uri, languageId, version, text);

        this._syncedDocuments.set(uri, document);
        this._onDidOpen.fire({ uri, version });
        this._onDidChangeContent.fire({ uri, version, changes: Empty.array() });
      }),
    );

    this._subscriptions.push(
      _connection.onDidChangeTextDocument(({ textDocument: { uri, version }, contentChanges }) => {
        if (contentChanges.length === 0) {
          return;
        }

        const prev = this._syncedDocuments.get(uri);
        if (!prev) {
          return;
        }

        const document = TextDocument.update(prev, contentChanges, version);

        this._syncedDocuments.set(uri, document);
        this._onDidChangeContent.fire({
          uri,
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
      }),
    );

    this._subscriptions.push(
      _connection.onDidCloseTextDocument(({ textDocument: { uri } }) => {
        if (!this._syncedDocuments.has(uri)) {
          return;
        }

        this._syncedDocuments.delete(uri);
        this._onDidClose.fire({ uri });
      }),
    );
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

  get(uri: string): TextDocument | undefined {
    return this._syncedDocuments.get(uri);
  }

  all(): TextDocument[] {
    return [...this._syncedDocuments.values()];
  }

  keys(): DocumentUri[] {
    return [...this._syncedDocuments.keys()];
  }

  async retrieve(uri: string): Promise<TextDocument> {
    const document = this.get(uri);
    if (document) {
      return document;
    }

    let promise = this._fileDocuments.get(uri);
    if (!promise) {
      promise = this._requestDocument(uri);
      this._fileDocuments.set(uri, promise);
    }
    return await promise;
  }

  private async _requestDocument(uri: string): Promise<TextDocument> {
    const languageId = this._languages.getLanguageIdByUri(uri);
    const elements = await this._connection.sendRequest(CustomMessages.FileRead, uri);
    const bytes = new Uint8Array(elements);
    return TextDocument.create(uri, languageId, 1, this._decoder.decode(bytes));
  }

  removeFile(uri: string) {
    return this._fileDocuments.delete(uri);
  }

  dispose(): void {
    for (const disposable of this._subscriptions) {
      disposable.dispose();
    }
    this._onDidOpen.dispose();
    this._onDidChangeContent.dispose();
    this._onDidClose.dispose();
    this._syncedDocuments.clear();
    this._fileDocuments.dispose();
  }
}
