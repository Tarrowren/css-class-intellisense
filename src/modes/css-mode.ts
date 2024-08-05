import { CompletionItem, CompletionItemKind, Location, Position, Range, TextDocument, Uri, workspace } from "vscode";
import { LanguageModelCache } from "../caches/cache";
import { LanguageCacheEntry } from "../caches/language-caches";
import { Configuration } from "../config";
import { CSS_NODE_TYPE } from "../lezer/css";
import { ReferenceMap } from "../reference-map";
import { logError } from "../runner";
import { cssDoComplete } from "../util/css-class-name";
import { getCssInsertionRange } from "../util/name-range";
import { getRangeFromTuple, getText } from "../util/text-document";
import { LanguageMode } from "./language-modes";

export class CssMode implements LanguageMode {
  constructor(
    private config: Configuration,
    private cache: LanguageModelCache<LanguageCacheEntry>,
    private referenceMap: ReferenceMap,
    private canNested: boolean = false,
  ) {}

  async doComplete(document: TextDocument, position: Position): Promise<CompletionItem[] | undefined> {
    if (this.config.lightweight) {
      return;
    }

    const entry = this.cache.get(document);

    const offset = document.offsetAt(position);
    const cursor = entry.tree.cursorAt(offset);

    if (!cssDoComplete(cursor.node, this.canNested)) {
      return;
    }

    const refs = await this.referenceMap.getRefs(document.uri);
    if (!refs || refs.size === 0) {
      return;
    }

    const items = new Map<string, CompletionItem>();
    const range = getRangeFromTuple(document, getCssInsertionRange(document.getText(), offset, entry.tree, cursor));

    await Promise.all(
      [...refs].map(async (ref) => {
        try {
          const uri = Uri.parse(ref);
          const document = await workspace.openTextDocument(uri);
          const entry = this.cache.get(document);
          for (const name of entry.usedClassNames.keys()) {
            const label = "." + name;
            const item = new CompletionItem(label, CompletionItemKind.Field);
            item.range = range;
            items.set(label, item);
          }
          for (const name of entry.usedIds.keys()) {
            const label = "#" + name;
            const item = new CompletionItem(label, CompletionItemKind.Field);
            item.range = range;
            items.set(label, item);
          }
        } catch (e) {
          logError(e, "do complete");
        }
      }),
    );

    return [...items.values()];
  }

  async findReferences(document: TextDocument, position: Position): Promise<Location[] | undefined> {
    if (this.config.lightweight) {
      return;
    }

    let fn: (entry: LanguageCacheEntry) => Map<string, Range[]>;
    const entry = this.cache.get(document);

    const cursor = entry.tree.cursorAt(document.offsetAt(position));
    if (cursor.type === CSS_NODE_TYPE.ClassName) {
      fn = (entry) => entry.usedClassNames;
    } else if (cursor.type === CSS_NODE_TYPE.IdName) {
      fn = (entry) => entry.usedIds;
    } else {
      return;
    }

    const refs = await this.referenceMap.getRefs(document.uri);
    if (!refs || refs.size === 0) {
      return;
    }

    const name = getText(document, cursor);
    const references: Location[] = [];

    await Promise.all(
      [...refs].map(async (ref) => {
        try {
          const uri = Uri.parse(ref);
          const document = await workspace.openTextDocument(uri);
          const entry = this.cache.get(document);

          const ranges = fn(entry).get(name);
          if (ranges) {
            for (const range of ranges) {
              references.push(new Location(uri, range));
            }
          }
        } catch (e) {
          logError(e, "find references");
        }
      }),
    );

    return references;
  }

  onDocumentRemoved(document: TextDocument): void {
    this.cache.onDocumentRemoved(document);
  }

  dispose() {}
}
