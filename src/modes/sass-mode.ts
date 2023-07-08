import { Location, Position, Range, TextDocument, Uri, workspace } from "vscode";
import { LanguageModelCache } from "../caches/cache";
import { LanguageCacheEntry } from "../caches/language-caches";
import { SassCacheEntry } from "../caches/sass-cache";
import { Configuration } from "../config";
import { SASS_NODE_TYPE } from "../lezer/sass";
import { ReferenceMap } from "../reference-map";
import { log } from "../runner";
import { getText } from "../util/text-document";
import { LanguageMode } from "./language-modes";

export class SassMode implements LanguageMode {
  constructor(
    private config: Configuration,
    private cache: LanguageModelCache<LanguageCacheEntry>,
    private referenceMap: ReferenceMap
  ) {}

  async findReferences(document: TextDocument, position: Position): Promise<Location[] | undefined> {
    if (this.config.lightweight) {
      return;
    }

    const entry = this.cache.get(document) as SassCacheEntry;

    const actions: Action[] = [];
    const cursor = entry.tree.cursorAt(document.offsetAt(position));
    if (cursor.type === SASS_NODE_TYPE.ClassName) {
      actions.push({
        name: getText(document, cursor),
        fn: getUsedClassNames,
      });
    } else if (cursor.type === SASS_NODE_TYPE.IdName) {
      actions.push({
        name: getText(document, cursor),
        fn: getUsedIdNames,
      });
    } else if (cursor.type === SASS_NODE_TYPE.Suffix) {
      const values = entry.getSuffixCacheValues(cursor);
      if (!values) {
        return;
      }

      for (const value of values) {
        if (value.type === SASS_NODE_TYPE.ClassName) {
          actions.push({
            name: value.name,
            fn: getUsedClassNames,
          });
        } else if (value.type === SASS_NODE_TYPE.IdName) {
          actions.push({
            name: value.name,
            fn: getUsedIdNames,
          });
        }
      }

      if (actions.length === 0) {
        return;
      }
    } else {
      return;
    }

    const refs = await this.referenceMap.getRefs(document.uri);
    if (!refs || refs.size === 0) {
      return;
    }

    const references: Location[] = [];

    await Promise.all(
      [...refs].map(async (ref) => {
        try {
          const uri = Uri.parse(ref);
          const document = await workspace.openTextDocument(uri);
          const entry = this.cache.get(document);

          for (const { fn, name } of actions) {
            const ranges = fn(entry).get(name);
            if (ranges) {
              for (const range of ranges) {
                references.push(new Location(uri, range));
              }
            }
          }
        } catch (e) {
          log.error(e as any, "find references");
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

function getUsedIdNames(entry: LanguageCacheEntry) {
  return entry.usedIds;
}

function getUsedClassNames(entry: LanguageCacheEntry) {
  return entry.usedClassNames;
}

interface Action {
  name: string;
  fn(entry: LanguageCacheEntry): Map<string, Range[]>;
}
