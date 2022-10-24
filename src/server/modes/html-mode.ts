import { SyntaxNode, TreeCursor } from "@lezer/common";
import { CompletionItem, CompletionItemKind, CompletionList, Definition, Location } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";
import { LanguageCaches } from "../caches/language-caches";
import { DocumentStore } from "../document/store";
import { CssNodeType, cssNodeTypes, HtmlNodeType, htmlNodeTypes } from "../nodetype";
import { getText, nearby } from "../utils/string";
import { LanguageMode } from "./language-modes";

export function getHTMLMode(store: DocumentStore, caches: LanguageCaches): LanguageMode {
  const id = "html";
  const htmlCache = caches.getCache(id);
  const cssCache = caches.getCache("css");

  if (!htmlCache || !cssCache) {
    throw new Error("Missing cache");
  }

  return {
    getId() {
      return id;
    },
    async doComplete(document, position) {
      const entry = htmlCache.get(document);

      const cursor = entry.tree.cursorAt(document.offsetAt(position));

      if (!isClassAttributeValue(document, cursor)) {
        return null;
      }

      const items = new Map<string, CompletionItem>();

      entry.classNameData.forEach((_v, label) => {
        if (!items.has(label)) {
          items.set(label, {
            label,
            kind: CompletionItemKind.Class,
          });
        }
      });

      let isIncomplete = false;

      const urls = entry.linkUrls;
      if (urls) {
        await Promise.all(
          store.changeReferenceDocument(document.uri, urls).map(async (ref) => {
            if (!ref.isOpened && !ref.isLocal) {
              isIncomplete = true;
              return;
            }

            const doc = await ref.textDocument;
            if (!doc) {
              return;
            }

            cssCache.get(doc).classNameData.forEach((_v, label) => {
              if (!items.has(label)) {
                items.set(label, {
                  label,
                  kind: CompletionItemKind.Class,
                });
              }
            });
          })
        );
      }

      return CompletionList.create([...items.values()], isIncomplete);
    },
    async findDefinition(document, position) {
      const entry = htmlCache.get(document);

      const offset = document.offsetAt(position);

      const cursor = entry.tree.cursorAt(offset);

      if (!isClassAttributeValue(document, cursor)) {
        return null;
      }

      const text = getText(document, cursor).slice(1, -1);
      if (!text) {
        return null;
      }

      const className = nearby(text, offset - cursor.from - 1);
      if (!className) {
        return null;
      }

      const definition: Definition = [];

      entry.classNameData.get(className)?.forEach((range) => {
        definition.push(Location.create(document.uri, range));
      });

      const urls = entry.linkUrls;
      if (urls) {
        await Promise.all(
          store.changeReferenceDocument(document.uri, urls).map(async (ref) => {
            if (!ref.isOpened && !ref.isLocal) {
              return;
            }

            const doc = await ref.textDocument;
            if (!doc) {
              return;
            }

            const uriObj = URI.parse(doc.uri);

            let uri: string;
            if (uriObj.scheme === "http" || uriObj.scheme === "https") {
              uri = URI.parse("css-class-intellisense:" + doc.uri).toString();
            } else {
              uri = doc.uri;
            }

            cssCache
              .get(doc)
              .classNameData.get(className)
              ?.forEach((range) => {
                definition.push(Location.create(uri, range));
              });
          })
        );
      }

      return definition;
    },
    async findReferences(document, position) {
      const entry = cssCache.get(document);

      const cursor = entry.tree.cursorAt(document.offsetAt(position));

      if (cursor.type !== cssNodeTypes[CssNodeType.ClassName]) {
        return null;
      }

      const className = getText(document, cursor);

      const references: Location[] = [];

      htmlCache
        .get(document)
        .classAttributeData?.get(className)
        ?.forEach((range) => {
          references.push(Location.create(document.uri, range));
        });

      return references;
    },
    onDocumentRemoved(document) {
      htmlCache.onDocumentRemoved(document.uri);
    },
    dispose() {
      htmlCache.dispose();
    },
  };
}

function isClassAttributeValue(document: TextDocument, cursor: TreeCursor) {
  let node: SyntaxNode | null = cursor.node;
  if (
    node.type !== htmlNodeTypes[HtmlNodeType.AttributeValue] ||
    !(node = node.prevSibling) ||
    node.type !== htmlNodeTypes[HtmlNodeType.Is] ||
    !(node = node.prevSibling) ||
    node.type !== htmlNodeTypes[HtmlNodeType.AttributeName] ||
    getText(document, node) !== "class"
  ) {
    return false;
  }

  return true;
}
