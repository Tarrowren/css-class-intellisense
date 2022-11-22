import { SyntaxNode, TreeCursor } from "@lezer/common";
import { CompletionItem, CompletionItemKind, Location, TextDocument, Uri, workspace } from "vscode";
import { LanguageModelCache } from "../caches/cache";
import { LanguageCacheEntry } from "../caches/language-caches";
import { CSS_NODE_TYPE } from "../lezer/css";
import { HTML_NODE_TYPE } from "../lezer/html";
import { formatError, outputChannel } from "../runner";
import { nearby } from "../util/string";
import { getText } from "../util/text-document";
import { LanguageMode } from "./language-modes";

export function createVueMode(cache: LanguageModelCache<LanguageCacheEntry>): LanguageMode {
  return {
    async doComplete(document, position) {
      const entry = cache.get(document);
      const cursor = entry.tree.cursorAt(document.offsetAt(position));

      if (!isClassAttributeValue(document, cursor)) {
        return;
      }

      const items = new Map<string, CompletionItem>();

      for (const label of entry.classNames.keys()) {
        if (!items.has(label)) {
          items.set(label, new CompletionItem(label, CompletionItemKind.Class));
        }
      }

      if (entry.hrefs && entry.hrefs.size > 0) {
        await Promise.all(
          [...entry.hrefs].map(async (href) => {
            try {
              const uri = Uri.parse(href);

              const document = await workspace.openTextDocument(uri);
              const entry = cache.get(document);

              for (const label of entry.classNames.keys()) {
                if (!items.has(label)) {
                  items.set(label, new CompletionItem(label, CompletionItemKind.Class));
                }
              }
            } catch (e) {
              outputChannel.appendLine(formatError("doComplete", e));
            }
          })
        );
      }

      return [...items.values()];
    },
    async findDefinition(document, position) {
      const entry = cache.get(document);
      const offset = document.offsetAt(position);
      const cursor = entry.tree.cursorAt(offset);

      if (!isClassAttributeValue(document, cursor)) {
        return;
      }

      const text = getText(document, cursor).slice(1, -1);
      if (!text) {
        return;
      }

      const className = nearby(text, offset - cursor.from - 1);
      if (!className) {
        return;
      }

      const definition: Location[] = [];

      const ranges = entry.classNames.get(className);
      if (ranges && ranges.length > 0) {
        for (const range of ranges) {
          definition.push(new Location(document.uri, range));
        }
      }

      if (entry.hrefs && entry.hrefs.size > 0) {
        await Promise.all(
          [...entry.hrefs].map(async (href) => {
            try {
              const uri = Uri.parse(href);

              const document = await workspace.openTextDocument(uri);
              const entry = cache.get(document);

              const ranges = entry.classNames.get(className);
              if (ranges) {
                for (const range of ranges) {
                  definition.push(new Location(document.uri, range));
                }
              }
            } catch (e) {
              outputChannel.appendLine(formatError("findDefinition", e));
            }
          })
        );
      }

      return definition;
    },
    findReferences(document, position) {
      const entry = cache.get(document);
      const cursor = entry.tree.cursorAt(document.offsetAt(position));

      if (cursor.type !== CSS_NODE_TYPE.ClassName) {
        return;
      }

      const className = getText(document, cursor);

      return entry.usedClassNames?.get(className)?.map((range) => {
        return new Location(document.uri, range);
      });
    },
    onDocumentRemoved(document) {
      cache.onDocumentRemoved(document);
    },
    dispose() {},
  };
}

function isClassAttributeValue(document: TextDocument, cursor: TreeCursor) {
  let node: SyntaxNode | null = cursor.node;
  if (
    node.type !== HTML_NODE_TYPE.AttributeValue ||
    !(node = node.prevSibling) ||
    node.type !== HTML_NODE_TYPE.Is ||
    !(node = node.prevSibling) ||
    node.type !== HTML_NODE_TYPE.AttributeName ||
    getText(document, node) !== "class"
  ) {
    return false;
  }

  return true;
}
