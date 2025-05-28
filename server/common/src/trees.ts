import { TreeFragment, type ChangedRange, type Tree } from "@lezer/common";
import type { Disposable } from "vscode-languageserver";
import { Cache } from "./cache";
import type { DocumentStore } from "./document-store";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type { Language } from "./languages";
import { StopWatch } from "./util";

interface Entry {
  version: number;
  tree: Tree;
  fragments: ReadonlyArray<TreeFragment>;
  edits: ReadonlyArray<ChangedRange>[];
}

export class Trees implements Disposable {
  private readonly _cache = new Cache<string, Entry>();
  private readonly _subscriptions: Disposable[] = [];

  constructor(private readonly _documents: DocumentStore) {
    this._subscriptions.push(
      _documents.onDidChangeContent(({ uri, changes }) => {
        const entry = this._cache.get(uri);
        if (!entry) {
          return;
        }

        entry.edits.push(changes);
      }),
    );
  }

  dispose(): void {
    for (const disposable of this._subscriptions) {
      disposable.dispose();
    }
    this._cache.dispose();
  }

  async getParseTree(documentOrUri: TextDocument | string, language: Language): Promise<Tree> {
    const document: TextDocument =
      typeof documentOrUri === "string" ? await this._documents.retrieve(documentOrUri) : documentOrUri;

    const uri = document.uri;
    const parser = language.parser;

    const entry = this._cache.get(uri);
    if (entry && entry.version === document.version) {
      return entry.tree;
    }

    const version = document.version;
    const text = document.getText();

    const sw = new StopWatch();
    let tree: Tree;
    if (entry) {
      let prev_fragments = entry.fragments;
      for (const changes of entry.edits) {
        prev_fragments = TreeFragment.applyChanges(prev_fragments, changes);
      }

      tree = parser.parse(text, prev_fragments);
      const fragments = TreeFragment.addTree(tree, prev_fragments);

      entry.version = version;
      entry.tree = tree;
      entry.fragments = fragments;
      entry.edits.length = 0;
    } else {
      tree = parser.parse(text);
      const fragments = TreeFragment.addTree(tree);

      this._cache.set(uri, { version, tree, fragments, edits: [] });
    }

    logger.log(`[${entry ? "incparse" : "parse"}] ${document.uri} ${sw.elapsed()}ms`);
    return tree;
  }
}
