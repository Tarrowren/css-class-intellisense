import { TreeCursor } from "@lezer/common";
import { CompletionItem, CompletionItemKind, Location, Position, Range, TextDocument, Uri, workspace } from "vscode";
import { LanguageModelCache } from "../caches/cache";
import { LanguageCacheEntry } from "../caches/language-caches";
import { Configuration } from "../config";
import { CSS_NODE_TYPE } from "../lezer/css";
import { ReferenceMap } from "../reference-map";
import { log } from "../runner";
import { getText } from "../util/text-document";
import { LanguageMode } from "./language-modes";

export class CssMode implements LanguageMode {
  private doCompleteDisabled: (cursor: TreeCursor) => boolean;

  constructor(
    private config: Configuration,
    private cache: LanguageModelCache<LanguageCacheEntry>,
    private referenceMap: ReferenceMap,
    dialect: boolean = false
  ) {
    if (dialect) {
      // TODO classname idname
      this.doCompleteDisabled = (cursor) =>
        cursor.type !== CSS_NODE_TYPE.StyleSheet &&
        cursor.type !== CSS_NODE_TYPE.RuleSet &&
        cursor.type !== CSS_NODE_TYPE.ClassSelector &&
        cursor.type !== CSS_NODE_TYPE.IdSelector &&
        cursor.type !== CSS_NODE_TYPE.Block;
    } else {
      this.doCompleteDisabled = (cursor) =>
        cursor.type !== CSS_NODE_TYPE.StyleSheet &&
        cursor.type !== CSS_NODE_TYPE.RuleSet &&
        cursor.type !== CSS_NODE_TYPE.ClassSelector &&
        cursor.type !== CSS_NODE_TYPE.IdSelector;
    }
  }

  async doComplete(document: TextDocument, position: Position): Promise<CompletionItem[] | undefined> {
    if (this.config.lightweight) {
      return;
    }

    const entry = this.cache.get(document);
    const cursor = entry.tree.cursorAt(document.offsetAt(position));

    if (this.doCompleteDisabled(cursor)) {
      return;
    }

    const refs = await this.referenceMap.getRefs(document.uri);
    if (!refs || refs.size === 0) {
      return;
    }

    const items = new Map<string, CompletionItem>();

    await Promise.all(
      [...refs].map(async (ref) => {
        try {
          const uri = Uri.parse(ref);
          const document = await workspace.openTextDocument(uri);
          const entry = this.cache.get(document);
          for (const name of entry.usedClassNames.keys()) {
            const label = "." + name;
            items.set(label, new CompletionItem(label, CompletionItemKind.Field));
          }
          for (const name of entry.usedIds.keys()) {
            const label = "#" + name;
            items.set(label, new CompletionItem(label, CompletionItemKind.Field));
          }
        } catch (e) {
          log.error(e, "do complete");
        }
      })
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
          log.error(e, "find references");
        }
      })
    );

    return references;
  }

  onDocumentRemoved(document: TextDocument): void {
    this.cache.onDocumentRemoved(document);
  }

  dispose() {}
}
