import { withResolvers } from "@cci/shared";
import { TreeFragment, type ChangedRange, type Tree } from "@lezer/common";
import type { LRParser } from "@lezer/lr";
import {
  CancellationTokenSource,
  DocumentUri,
  LRUCache,
  type CancellationToken,
  type Disposable,
} from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { CancellationError } from "./cancellation";
import type { DocumentStore } from "./document-store";
import { scheduler } from "./env";
import type { Language } from "./languages";
import { Spin } from "./spin";
import { StopWatch } from "./stop-watch";

interface Edit {
  readonly version: number;
  readonly changes: ReadonlyArray<ChangedRange>;
}

interface ParseTreeRequest {
  readonly source: CancellationTokenSource;
  readonly value: Promise<ParseTreeResult>;
}

interface ParseTreeContext {
  version: number;
  tree: Tree;
  fragments: ReadonlyArray<TreeFragment>;
  edits: Edit[];
}

interface ParseTreeResult {
  readonly document: TextDocument;
  readonly tree: Tree;
}

export class Trees implements Disposable {
  private readonly _requests = new Map<DocumentUri, ParseTreeRequest>();
  private readonly _ctxs = new LRUCache<DocumentUri, ParseTreeContext>(1024);

  constructor(private readonly _documents: DocumentStore) {
    _documents.onDidChangeContent(({ uri, version, changes }) => {
      if (changes.length > 0) {
        this._ctxs.get(uri)?.edits.push({ version, changes });
      }
    });
  }

  dispose(): void {
    for (const request of this._requests.values()) {
      request.source.cancel();
    }
    this._requests.clear();
    this._ctxs.clear();
  }

  getParseTree(
    document: TextDocument,
    language: Language,
    token: CancellationToken,
  ): Promise<ParseTreeResult> | ParseTreeResult {
    const documentUri = document.uri;
    const request = this._requests.get(documentUri);
    if (request) {
      return _cancelable(request.value, token);
    }

    const ctx = this._ctxs.get(documentUri);
    if (ctx && ctx.edits.length === 0) {
      return { document, tree: ctx.tree };
    }

    const source = new CancellationTokenSource();
    const value = this._parse_document(documentUri, language.parser, source.token).finally(() => {
      this._requests.delete(documentUri);
    });
    this._requests.set(documentUri, { source, value });
    return _cancelable(value, token);
  }

  removeFile(documentUri: DocumentUri): void {
    const request = this._requests.get(documentUri);
    if (request) {
      request.source.cancel();
      this._requests.delete(documentUri);
    }
    this._ctxs.delete(documentUri);
  }

  async _parse_document(
    documentUri: DocumentUri,
    parser: LRParser,
    token: CancellationToken,
  ): Promise<ParseTreeResult> {
    for (;;) {
      const document = await this._documents.retrieve(documentUri, token);
      const ctx = this._ctxs.get(documentUri);

      const version = document.version;
      const input = document.getText();

      if (ctx) {
        let prevFragments = ctx.fragments;
        for (const edit of ctx.edits) {
          prevFragments = TreeFragment.applyChanges(prevFragments, edit.changes);
        }

        ctx.edits.length = 0;

        const sw = StopWatch.create();
        const tree = await _parse(parser, input, prevFragments, token);
        console.info("[Incparse]", documentUri, sw.elapsed(2));

        const fragments = TreeFragment.addTree(tree, prevFragments);

        ctx.version = version;
        ctx.tree = tree;
        ctx.fragments = fragments;
        if (ctx.edits.length === 0) {
          return { document, tree };
        }
      } else {
        const sw = StopWatch.create();
        const tree = await _parse(parser, input, undefined, token);
        console.info("[Parse]", documentUri, sw.elapsed(2));

        const fragments = TreeFragment.addTree(tree);
        this._ctxs.set(documentUri, { version, tree, fragments, edits: [] });

        return { document, tree };
      }
    }
  }
}

const _spin = Spin.create(4096);
async function _parse(
  parser: LRParser,
  input: string,
  fragments: ReadonlyArray<TreeFragment> | undefined,
  token: CancellationToken,
): Promise<Tree> {
  const parse = parser.startParse(input, fragments);

  let tree: Tree | null | undefined;
  for (;;) {
    const sw = StopWatch.create();

    for (let i = 0; i < _spin.value; i++) {
      tree = parse.advance();
      if (tree) {
        break;
      }
    }

    const time = sw.elapsed();
    // console.debug("[AsyncParse] spin:", _spin.toString(), ", time:", time.toFixed(2) + "ms");

    if (time > 16) {
      _spin.decrease();
    } else {
      _spin.increase();
    }

    if (tree) {
      return tree;
    }

    await scheduler().yield(token);
  }
}

async function _cancelable(value: Promise<ParseTreeResult>, token: CancellationToken): Promise<ParseTreeResult> {
  if (token.isCancellationRequested) {
    throw new CancellationError();
  }

  const { promise, reject } = withResolvers<ParseTreeResult>();
  const disposable = token.onCancellationRequested(() => {
    reject(new CancellationError());
  });
  try {
    return await Promise.race([value, promise]);
  } finally {
    disposable.dispose();
  }
}
