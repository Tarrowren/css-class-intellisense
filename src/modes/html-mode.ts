import { SyntaxNode, TreeCursor } from "@lezer/common";
import {
  CompletionItem,
  CompletionItemKind,
  Location,
  Position,
  ProviderResult,
  Range,
  TextDocument,
  Uri,
  workspace,
  WorkspaceEdit,
} from "vscode";
import { LanguageModelCache } from "../caches/cache";
import { LanguageCacheEntry } from "../caches/language-caches";
import { Configuration } from "../config";
import { CSSCI_HTTPS_SCHEME, CSSCI_HTTP_SCHEME, HTTPS_SCHEME, HTTP_SCHEME } from "../http-file-system";
import { CSS_NODE_TYPE } from "../lezer/css";
import { HTML_NODE_TYPE } from "../lezer/html";
import { log } from "../runner";
import { getRangeOfClassSelector, getRangeOfIdSelector, getRangeOfRuleSet } from "../util/css-class-name";
import { nearbyWord, POINT, SHARP } from "../util/string";
import { getText } from "../util/text-document";
import { LanguageMode } from "./language-modes";

export class HtmlMode implements LanguageMode {
  constructor(_config: Configuration, private cache: LanguageModelCache<LanguageCacheEntry>) {}

  async doComplete(document: TextDocument, position: Position): Promise<CompletionItem[] | undefined> {
    const entry = this.cache.get(document);

    const cursor = entry.tree.cursorAt(document.offsetAt(position));
    log.info({ type: cursor.type, text: getText(document, cursor) });
    if (
      cursor.type === CSS_NODE_TYPE.StyleSheet ||
      cursor.type === CSS_NODE_TYPE.RuleSet ||
      cursor.type === CSS_NODE_TYPE.ClassSelector ||
      cursor.type === CSS_NODE_TYPE.ClassName ||
      cursor.type === CSS_NODE_TYPE.IdSelector ||
      cursor.type === CSS_NODE_TYPE.IdName
      // ||      cursor.type === CSS_NODE_TYPE.DescendantSelector
    ) {
      const items = new Map<string, CompletionItem>();

      let range: Range | undefined;
      if (cursor.type === CSS_NODE_TYPE.RuleSet) {
        range = getRangeOfRuleSet(document, position, entry.tree);
      } else if (cursor.type === CSS_NODE_TYPE.ClassSelector) {
        range = getRangeOfClassSelector(document, position, entry.tree);
      } else if (cursor.type === CSS_NODE_TYPE.IdSelector) {
        range = getRangeOfIdSelector(document, position, entry.tree);
      } else if (cursor.type === CSS_NODE_TYPE.ClassName || cursor.type === CSS_NODE_TYPE.IdName) {
        range = new Range(document.positionAt(cursor.from - 1), document.positionAt(cursor.to));
      }

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

      return [...items.values()];
    }

    const attr = this.getAttributeName(document, cursor);

    let fn: (entry: LanguageCacheEntry) => Map<string, Range[]>;
    let kind: CompletionItemKind;
    if (attr === "class") {
      fn = (entry) => entry.classNames;
      kind = CompletionItemKind.Class;
    } else if (attr === "id") {
      fn = (entry) => entry.ids;
      kind = CompletionItemKind.Field;
    } else {
      return;
    }

    const items = new Map<string, CompletionItem>();

    for (const label of fn(entry).keys()) {
      if (!items.has(label)) {
        items.set(label, new CompletionItem(label, kind));
      }
    }

    if (entry.hrefs.size > 0) {
      await Promise.all(
        [...entry.hrefs].map(async (href) => {
          try {
            const uri = Uri.parse(href);
            const document = await workspace.openTextDocument(uri);

            const entry = this.cache.get(document);
            for (const label of fn(entry).keys()) {
              if (!items.has(label)) {
                items.set(label, new CompletionItem(label, kind));
              }
            }
          } catch (e) {
            log.error(e, "do complete");
          }
        })
      );
    }

    return [...items.values()];
  }

  async findDefinition(document: TextDocument, position: Position): Promise<Location[] | undefined> {
    const entry = this.cache.get(document);
    const offset = document.offsetAt(position);
    const cursor = entry.tree.cursorAt(offset);

    const attr = this.getAttributeName(document, cursor);
    let fn0: (text: string) => string | undefined;
    let fn1: (entry: LanguageCacheEntry) => Map<string, Range[]>;
    if (attr === "class") {
      fn0 = (text) => nearbyWord(text, offset - cursor.from - 1);
      fn1 = (entry) => entry.classNames;
    } else if (attr === "id") {
      fn0 = (text) => text.trim();
      fn1 = (entry) => entry.ids;
    } else {
      return;
    }

    const text = getText(document, cursor).slice(1, -1);
    if (!text) {
      return;
    }

    const name = fn0(text);
    if (!name) {
      return;
    }

    const definition: Location[] = [];

    const ranges = fn1(entry).get(name);
    if (ranges && ranges.length > 0) {
      for (const range of ranges) {
        definition.push(new Location(document.uri, range));
      }
    }

    if (entry.hrefs.size > 0) {
      await Promise.all(
        [...entry.hrefs].map(async (href) => {
          try {
            const uri = Uri.parse(href);

            const document = await workspace.openTextDocument(uri);
            const entry = this.cache.get(document);

            const ranges = fn1(entry).get(name);
            if (ranges) {
              for (const range of ranges) {
                definition.push(new Location(document.uri, range));
              }
            }
          } catch (e) {
            log.error(e, "find definition");
          }
        })
      );
    }

    return definition;
  }

  findReferences(document: TextDocument, position: Position): ProviderResult<Location[]> {
    const entry = this.cache.get(document);
    const cursor = entry.tree.cursorAt(document.offsetAt(position));

    let fn: (entry: LanguageCacheEntry) => Map<string, Range[]>;
    if (cursor.type === CSS_NODE_TYPE.ClassName) {
      fn = (entry) => entry.usedClassNames;
    } else if (cursor.type === CSS_NODE_TYPE.IdName) {
      fn = (entry) => entry.usedIds;
    } else {
      return;
    }

    const name = getText(document, cursor);

    return fn(entry)
      .get(name)
      ?.map((range) => {
        return new Location(document.uri, range);
      });
  }

  async doRename(document: TextDocument, position: Position, newName: string): Promise<WorkspaceEdit | undefined> {
    const entry = this.cache.get(document);
    const offset = document.offsetAt(position);

    const cursor = entry.tree.cursorAt(offset);

    if (cursor.type === CSS_NODE_TYPE.ClassName) {
      return this.replace(document, cursor, newName, POINT, (name, fn) => {
        entry.classNames.get(name)?.forEach(fn);
        entry.usedClassNames.get(name)?.forEach(fn);
      });
    } else if (cursor.type === CSS_NODE_TYPE.IdName) {
      return this.replace(document, cursor, newName, SHARP, (name, fn) => {
        entry.ids.get(name)?.forEach(fn);
        entry.usedIds.get(name)?.forEach(fn);
      });
    }

    const attr = this.getAttributeName(document, cursor);
    let fn0: (text: string) => string | undefined;
    let fn1: (entry: LanguageCacheEntry) => Map<string, Range[]>;
    let fn2: (entry: LanguageCacheEntry) => Map<string, Range[]>;
    if (attr === "class") {
      fn0 = (text) => nearbyWord(text, offset - cursor.from - 1);
      fn1 = (entry) => entry.classNames;
      fn2 = (entry) => entry.usedClassNames;
    } else if (attr === "id") {
      fn0 = (text) => text.trim();
      fn1 = (entry) => entry.ids;
      fn2 = (entry) => entry.usedIds;
    } else {
      return;
    }

    const text = getText(document, cursor).slice(1, -1);
    if (!text) {
      return;
    }

    const name = fn0(text);
    if (!name) {
      return;
    }

    const workspaceEdit = new WorkspaceEdit();
    fn1(entry)
      .get(name)
      ?.forEach((range) => {
        workspaceEdit.replace(document.uri, range, newName);
      });
    fn2(entry)
      .get(name)
      ?.forEach((range) => {
        workspaceEdit.replace(document.uri, range, newName);
      });

    if (entry.hrefs.size > 0) {
      await Promise.all(
        [...entry.hrefs].map(async (href) => {
          try {
            const uri = Uri.parse(href);
            if (
              uri.scheme === CSSCI_HTTPS_SCHEME ||
              uri.scheme === CSSCI_HTTP_SCHEME ||
              uri.scheme === HTTPS_SCHEME ||
              uri.scheme === HTTP_SCHEME
            ) {
              return;
            }

            const document = await workspace.openTextDocument(uri);
            const entry = this.cache.get(document);

            const ranges = fn1(entry).get(name);
            if (ranges) {
              for (const range of ranges) {
                workspaceEdit.replace(document.uri, range, newName);
              }
            }
          } catch (e) {
            log.error(e, "do rename");
          }
        })
      );
    }

    return workspaceEdit;
  }

  onDocumentRemoved(document: TextDocument): void {
    this.cache.onDocumentRemoved(document);
  }

  dispose() {}

  private getAttributeName(document: TextDocument, cursor: TreeCursor): string | undefined {
    let node: SyntaxNode | null = cursor.node;
    if (
      node.type === HTML_NODE_TYPE.AttributeValue &&
      (node = node.prevSibling) &&
      node.type === HTML_NODE_TYPE.Is &&
      (node = node.prevSibling) &&
      node.type === HTML_NODE_TYPE.AttributeName
    ) {
      return getText(document, node);
    }
  }

  private replace(
    document: TextDocument,
    cursor: TreeCursor,
    newName: string,
    charCode: number,
    fn: (name: string, forEach: (range: Range) => void) => void
  ) {
    if (newName.charCodeAt(0) === charCode) {
      if (newName.length <= 1) {
        return;
      }

      newName = newName.substring(1);
    }

    const name = getText(document, cursor);

    const workspaceEdit = new WorkspaceEdit();

    fn(name, (range) => {
      workspaceEdit.replace(document.uri, range, newName);
    });

    return workspaceEdit;
  }
}
