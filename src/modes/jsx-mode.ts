import { SyntaxNode, TreeCursor } from "@lezer/common";
import {
  CompletionItem,
  CompletionItemKind,
  Location,
  Position,
  TextDocument,
  Uri,
  WorkspaceEdit,
  workspace,
} from "vscode";
import { LanguageModelCache } from "../caches/cache";
import { LanguageCacheEntry } from "../caches/language-caches";
import { Configuration } from "../config";
import { CssConfig } from "../css-config";
import { CSSCI_HTTPS_SCHEME, CSSCI_HTTP_SCHEME, HTTPS_SCHEME, HTTP_SCHEME } from "../http-file-system";
import { JS_NODE_TYPE } from "../lezer/javascript";
import { logError } from "../runner";
import { getJsxInsertionRange } from "../util/name-range";
import { nearbyWord } from "../util/string";
import { getRangeFromTuple, getText } from "../util/text-document";
import { LanguageMode } from "./language-modes";

export class JsxMode implements LanguageMode {
  constructor(
    _config: Configuration,
    private cache: LanguageModelCache<LanguageCacheEntry>,
    private cssConfig: CssConfig,
  ) {}

  async doComplete(document: TextDocument, position: Position): Promise<CompletionItem[] | undefined> {
    const entry = this.cache.get(document);
    const offset = document.offsetAt(position);
    const cursor = entry.tree.cursorAt(offset);

    const attr = this.getAttributeName(document, cursor);
    if (attr === "className") {
      const items = new Map<string, CompletionItem>();
      const range = getRangeFromTuple(document, getJsxInsertionRange(document.getText(), offset, entry.tree, cursor));

      const hrefs = await this.getHrefs(document, entry);
      if (hrefs.size > 0) {
        await Promise.all(
          [...hrefs].map(async (href) => {
            try {
              const uri = Uri.parse(href);

              const document = await workspace.openTextDocument(uri);
              const entry = this.cache.get(document);

              for (const label of entry.classNames.keys()) {
                if (!items.has(label)) {
                  const item = new CompletionItem(label, CompletionItemKind.Class);
                  item.range = range;
                  items.set(label, item);
                }
              }
            } catch (e) {
              logError(e, "do complete");
            }
          }),
        );
      }

      return [...items.values()];
    }
  }

  async findDefinition(document: TextDocument, position: Position): Promise<Location[] | undefined> {
    const entry = this.cache.get(document);
    const offset = document.offsetAt(position);
    const cursor = entry.tree.cursorAt(offset);

    const attr = this.getAttributeName(document, cursor);
    if (attr === "className") {
      const text = getText(document, cursor).slice(1, -1);
      if (!text) {
        return;
      }

      const className = nearbyWord(text, offset - cursor.from - 1);
      if (!className) {
        return;
      }

      const definition: Location[] = [];

      const hrefs = await this.getHrefs(document, entry);
      if (hrefs.size > 0) {
        await Promise.all(
          [...hrefs].map(async (href) => {
            try {
              const uri = Uri.parse(href);

              const document = await workspace.openTextDocument(uri);
              const entry = this.cache.get(document);

              const ranges = entry.classNames.get(className);
              if (ranges) {
                for (const range of ranges) {
                  definition.push(new Location(document.uri, range));
                }
              }
            } catch (e) {
              logError(e, "find definition");
            }
          }),
        );
      }

      return definition;
    }
  }

  async doRename(document: TextDocument, position: Position, newName: string): Promise<WorkspaceEdit | undefined> {
    const entry = this.cache.get(document);
    const offset = document.offsetAt(position);
    const cursor = entry.tree.cursorAt(offset);

    const attr = this.getAttributeName(document, cursor);
    if (attr === "className") {
      const text = getText(document, cursor).slice(1, -1);
      if (!text) {
        return;
      }

      const className = nearbyWord(text, offset - cursor.from - 1);
      if (!className) {
        return;
      }

      const workspaceEdit = new WorkspaceEdit();
      entry.usedClassNames.get(className)?.forEach((range) => {
        workspaceEdit.replace(document.uri, range, newName);
      });

      const hrefs = await this.getHrefs(document, entry);
      if (hrefs.size > 0) {
        await Promise.all(
          [...hrefs].map(async (href) => {
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

              const ranges = entry.classNames.get(className);
              if (ranges) {
                for (const range of ranges) {
                  workspaceEdit.replace(document.uri, range, newName);
                }
              }
            } catch (e) {
              logError(e, "do rename");
            }
          }),
        );
      }

      return workspaceEdit;
    }
  }

  onDocumentRemoved(document: TextDocument): void {
    this.cache.onDocumentRemoved(document);
  }

  dispose() {}

  private getAttributeName(document: TextDocument, cursor: TreeCursor): string | undefined {
    let node: SyntaxNode | null = cursor.node;
    if (
      node.type === JS_NODE_TYPE.JSXAttributeValue &&
      (node = node.prevSibling) &&
      node.type === JS_NODE_TYPE.Equals &&
      (node = node.prevSibling) &&
      node.type === JS_NODE_TYPE.JSXIdentifier
    ) {
      return getText(document, node);
    }
  }

  private async getHrefs(document: TextDocument, entry: LanguageCacheEntry) {
    const hrefs = await this.cssConfig.getGlobalCssFiles(document.uri);

    return new Set([...hrefs, ...entry.hrefs]);
  }
}
