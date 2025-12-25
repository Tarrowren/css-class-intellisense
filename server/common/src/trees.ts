import { TreeFragment, type ChangedRange, type Tree } from "@lezer/common";
import type { LRParser } from "@lezer/lr";
import { CancellationToken, CancellationTokenSource, type Disposable } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { Cache } from "./cache";
import type { DocumentStore } from "./document-store";
import type { Language } from "./languages";
import { StopWatch } from "./stop-watch";

interface Edit {
  readonly version: number;
  readonly changes: ReadonlyArray<ChangedRange>;
}

interface Entry {
  version: number;
  tree: Tree;
  fragments: ReadonlyArray<TreeFragment>;
  edits: Edit[];
}

export class Trees implements Disposable {
  private readonly _cache = Cache.create<string, Entry>();
  private readonly _source = new CancellationTokenSource();

  constructor(private readonly _documents: DocumentStore) {
    const listener = _documents.onDidChangeContent(({ uri, version, changes }) => {
      if (changes.length > 0) {
        this._cache.get(uri)?.edits.push({ version, changes });
      }
    });
    this._source.token.onCancellationRequested(listener.dispose, listener);
  }

  dispose(): void {
    this._source.cancel();
    this._cache.dispose();
  }

  async getParseTree(documentOrUri: TextDocument | string, language: Language): Promise<Tree> {
    const document: TextDocument =
      typeof documentOrUri === "string" ? await this._documents.retrieve(documentOrUri) : documentOrUri;

    const uri = document.uri;
    const version = document.version;
    const input = document.getText();

    const parser = language.parser;

    const entry = this._cache.get(uri);
    if (entry && entry.version === version) {
      return entry.tree;
    }

    const sw = StopWatch.create();

    if (entry) {
      let start = -1;
      let end = -1;
      for (let i = 0; i < entry.edits.length; i++) {
        const edit = entry.edits[i];
        if (edit.version === entry.version + 1) {
          start = i;
        }

        if (edit.version === version) {
          end = i + 1;
          break;
        }
      }

      if (start >= 0 && end >= 0) {
        const edits = entry.edits.slice(start, end);
        entry.edits = entry.edits.slice(end);

        let prev_fragments = entry.fragments;
        for (const edit of edits) {
          prev_fragments = TreeFragment.applyChanges(prev_fragments, edit.changes);
        }

        const tree = await parse(parser, input, prev_fragments, this._source.token);
        const fragments = TreeFragment.addTree(tree, prev_fragments);

        entry.version = version;
        entry.tree = tree;
        entry.fragments = fragments;

        logger.info(`[Incparse] ${document.uri} ${sw.elapsed(2)}ms`);
        return tree;
      } else {
        entry.edits.length = 0;
      }
    }

    const tree = await parse(parser, input, undefined, this._source.token);
    const fragments = TreeFragment.addTree(tree);

    if (entry) {
      entry.version = version;
      entry.tree = tree;
      entry.fragments = fragments;
    } else {
      this._cache.set(uri, { edits: [], version, tree, fragments });
    }

    logger.info(`[Parse] ${document.uri} ${sw.elapsed(2)}ms`);
    return tree;
  }
}

let spin = 4096;
async function parse(
  parser: LRParser,
  input: string,
  fragments?: ReadonlyArray<TreeFragment>,
  token?: CancellationToken,
): Promise<Tree> {
  const parse = parser.startParse(input, fragments);

  let tree: Tree | null | undefined;
  for (;;) {
    const sw = StopWatch.create();

    for (let i = 0; i < spin; i++) {
      tree = parse.advance();
      if (tree) {
        break;
      }
    }

    const time = sw.elapsed();
    logger.debug(`[Async Parse] spin: ${spin}, time: ${time.toFixed(2)}`);

    if (time > 16) {
      spin >>= 1;
    }

    if (tree) {
      return tree;
    }

    if (time <= 16) {
      spin += spin >> 4;
    }

    await scheduler.yield();
    if (token?.isCancellationRequested) {
      throw new Error("cancelled");
    }
  }
}
