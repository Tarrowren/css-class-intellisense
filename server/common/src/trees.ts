import { withResolvers } from "@cci/shared";
import { TreeFragment, type ChangedRange, type PartialParse, type Tree } from "@lezer/common";
import type { LRParser } from "@lezer/lr";
import {
  CancellationTokenSource,
  DocumentUri,
  Emitter,
  LRUCache,
  type CancellationToken,
  type Disposable,
} from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { CancellationError } from "./cancellation";
import type {
  DocumentStore,
  TextDocumentChangeEvent,
  TextDocumentCloseEvent,
  TextDocumentOpenEvent,
} from "./document-store";
import { scheduler } from "./env";
import type { Language, Languages } from "./languages";
import { Spin } from "./spin";

export class Trees implements Disposable {
  private readonly _synced = new Map<DocumentUri, AsyncParse>();
  private readonly _requests = new Map<DocumentUri, ParseRequest>();
  private readonly _cache = new LRUCache<DocumentUri, ParseEntry>(1024);

  private readonly _spin = Spin.create(4096);

  constructor(
    private readonly _documents: DocumentStore,
    private readonly _languages: Languages,
  ) {
    _documents.onDidOpen(this._onOpen.bind(this));
    _documents.onDidChangeContent(this._onChange.bind(this));
    _documents.onDidClose(this._onClose.bind(this));
  }

  dispose(): void {
    for (const parse of this._synced.values()) {
      parse.dispose();
    }
    this._synced.clear();
    for (const request of this._requests.values()) {
      request.source.cancel();
    }
    this._requests.clear();
    this._cache.clear();
  }

  async get(document: TextDocument, language: Language, token: CancellationToken): Promise<Tree> {
    if (token.isCancellationRequested) {
      throw new CancellationError();
    }

    const documentUri = document.uri;
    const parse = this._synced.get(documentUri);
    if (parse) {
      return await parse.get(document.version, token);
    }

    const entry = this._cache.get(documentUri);
    if (entry) {
      if (entry.version === document.version) {
        return entry.tree;
      } else {
        this._cache.delete(documentUri);
      }
    }

    let request = this._requests.get(documentUri);
    if (!request || request.version !== document.version) {
      request?.source.cancel();
      request = this._createRequest(document, language.parser, token);
      this._requests.set(documentUri, request);
    }

    if (!request.tokens.has(token)) {
      request.subscriptions.push(this._cancel(documentUri, token));
      request.tokens.add(token);
    }
    return await request.value;
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

  private _createRequest(document: TextDocument, parser: LRParser, token: CancellationToken): ParseRequest {
    const documentUri = document.uri;
    const version = document.version;
    const source = new CancellationTokenSource();
    const subscriptions: Disposable[] = [this._cancel(documentUri, token)];
    const tokens = new Set<CancellationToken>([token]);
    const value = this._requestParse(document, parser, source.token)
      .then((tree) => {
        this._cache.set(documentUri, { version, tree });
        return tree;
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

    const request: ParseRequest = {
      version,
      source,
      subscriptions,
      tokens,
      value,
    };

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

  private async _requestParse(document: TextDocument, parser: LRParser, token: CancellationToken): Promise<Tree> {
    const parse = parser.startParse(document.getText());

    let tree: Tree | null | undefined;
    do {
      await scheduler().yield(token);

      const start = performance.now();
      for (let i = 0; i < this._spin.value; ++i) {
        tree = parse.advance();
        if (tree) {
          break;
        }
      }
      const time = performance.now() - start;

      if (time > 16) {
        this._spin.decrease();
      } else if (!tree) {
        this._spin.increase();
      }
    } while (!tree);

    return tree;
  }

  private _onOpen({ uri, version }: TextDocumentOpenEvent) {
    let document: TextDocument | undefined;
    let language: Language | null | undefined;
    if (
      (document = this._documents.get(uri)) &&
      document.version === version &&
      (language = this._languages.get(document.languageId))
    ) {
      this._synced.set(uri, new AsyncParse(document, language.parser, this._spin));
    }
    this.removeFile(uri);
  }

  private _onChange({ uri, version, changes }: TextDocumentChangeEvent) {
    let document: TextDocument | undefined;
    let language: Language | null | undefined;
    if (
      (document = this._documents.get(uri)) &&
      document.version === version &&
      (language = this._languages.get(document.languageId))
    ) {
      const parse = this._synced.get(uri);
      if (parse) {
        parse.change(document, changes);
      } else {
        this._synced.set(uri, new AsyncParse(document, language.parser, this._spin));
      }
    }
  }

  private _onClose({ uri }: TextDocumentCloseEvent) {
    const parse = this._synced.get(uri);
    if (parse) {
      parse.dispose();
      this._synced.delete(uri);
    }
  }
}

class AsyncParse implements Disposable {
  private _version = -1;
  private _parse: PartialParse | null | undefined;
  private _tree: Tree | null | undefined;
  private _fragments: ReadonlyArray<TreeFragment> | undefined;

  private _changes: ReadonlyArray<ChangedRange> | null | undefined;

  private readonly _source = new CancellationTokenSource();
  private readonly _done = new Emitter<void>();
  private _yield = false;

  constructor(
    private _document: TextDocument,
    private readonly _parser: LRParser,
    private readonly _spin: Spin,
  ) {
    this._tick();
  }

  private _tick() {
    if (this._version > this._document.version) {
      this._version = -1;
      this._parse = null;
      this._tree = null;
      this._fragments = undefined;
      this._changes = null;
    }

    if (!this._parse) {
      if (this._version === this._document.version) {
        return;
      }

      if (this._changes) {
        if (this._fragments) {
          this._fragments = applyChanges(this._fragments, this._changes);
        }
        this._changes = null;
      }

      this._version = this._document.version;
      this._tree = null;
      this._parse = this._parser.startParse(this._document.getText(), this._fragments);
    } else if (this._changes) {
      if (this._changes.length > 0) {
        let tree: Tree | null | undefined;
        this._parse.stopAt(this._parse.parsedPos);
        while (!(tree = this._parse.advance())) {
          // ignore
        }

        this._fragments = applyChanges(TreeFragment.addTree(tree, this._fragments, true), this._changes);
      } else {
        this._fragments = undefined;
      }
      this._changes = null;

      this._version = this._document.version;
      this._tree = null;
      this._parse = this._parser.startParse(this._document.getText(), this._fragments);
    } else {
      let tree: Tree | null | undefined;
      const start = performance.now();
      for (let i = 0; i < this._spin.value; ++i) {
        tree = this._parse.advance();
        if (tree) {
          break;
        }
      }
      const time = performance.now() - start;

      if (time > 16) {
        this._spin.decrease();
      } else if (!tree) {
        this._spin.increase();
      }

      if (tree) {
        this._tree = tree;
        this._fragments = TreeFragment.addTree(tree, this._fragments);
        this._parse = null;
        this._done.fire();
        return;
      }
    }

    if (!this._yield) {
      this._yield = true;
      scheduler()
        .yield(this._source.token)
        .then(() => {
          this._yield = false;
          this._tick();
        })
        .catch((_err) => {
          // ignore
        });
    }
  }

  change(document: TextDocument, changes: ReadonlyArray<ChangedRange>): void {
    this._document = document;
    this._changes = changes;
    this._tick();
  }

  async get(version: number, token: CancellationToken): Promise<Tree> {
    if (token.isCancellationRequested) {
      throw new CancellationError();
    }

    if (this._version === version && this._tree) {
      return this._tree;
    }

    const { promise, resolve, reject } = withResolvers<void>();

    const disposable1 = token.onCancellationRequested(() => {
      reject(new CancellationError());
    });
    const disposable2 = this._done.event(resolve);

    try {
      await promise;
      if (this._version === version && this._tree) {
        return this._tree;
      } else {
        throw new CancellationError();
      }
    } finally {
      disposable1.dispose();
      disposable2.dispose();
    }
  }

  dispose(): void {
    this._source.cancel();
    this._done.dispose();
  }
}

interface ParseRequest {
  readonly version: number;
  readonly source: CancellationTokenSource;
  readonly subscriptions: Disposable[];
  readonly tokens: Set<CancellationToken>;
  readonly value: Promise<Tree>;
}

interface ParseEntry {
  readonly version: number;
  readonly tree: Tree;
}

function applyChanges(fragments: readonly TreeFragment[], changes: readonly ChangedRange[], minGap = 128) {
  if (changes.length === 0) {
    return fragments;
  }

  const result: TreeFragment[] = [];
  let fI = 1,
    nextF = fragments.length ? fragments[0] : null;
  for (let cI = 0, pos = 0, off = 0; ; cI++) {
    const nextC = cI < changes.length ? changes[cI] : null;
    const nextPos = nextC ? nextC.fromA : 1e9;
    if (nextPos - pos >= minGap) {
      while (nextF && nextF.from < nextPos) {
        let cut: TreeFragment | null = nextF;
        if (pos >= cut.from || nextPos <= cut.to || off) {
          const fFrom = Math.max(cut.from, pos) - off,
            fTo = Math.min(cut.to, nextPos) - off;
          cut =
            fFrom >= fTo
              ? null
              : new TreeFragment(
                  fFrom,
                  fTo,
                  cut.tree,
                  cut.offset + off,
                  cut.openStart || cI > 0,
                  cut.openEnd || !!nextC,
                );
        }
        if (cut) {
          result.push(cut);
        }
        if (nextF.to > nextPos) {
          break;
        }
        nextF = fI < fragments.length ? fragments[fI++] : null;
      }
    }
    if (!nextC) {
      break;
    }
    pos = nextC.toA;
    off = nextC.toA - nextC.toB;
  }
  return result;
}
