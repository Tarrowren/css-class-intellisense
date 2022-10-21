import { parseMixed, SyntaxNodeRef } from "@lezer/common";
import * as LEZER_CSS from "@lezer/css";
import * as LEZER_HTML from "@lezer/html";
import { CompletionItem, CompletionItemKind, CompletionList } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { URI, Utils } from "vscode-uri";
import { DocumentStore } from "../document/store";
import { CssNodeType, cssNodeTypes, HtmlNodeType, htmlNodeTypes } from "../nodetype";
import { RuntimeEnvironment } from "../runner";
import { getLanguageModelCache, LanguageModelCache } from "./cache";
import { LanguageMode } from "./language-modes";

const HTML_CSS_PARSER = LEZER_HTML.parser.configure({
  wrap: parseMixed((node) => {
    if (node.type === htmlNodeTypes[HtmlNodeType.StyleText]) {
      return { parser: LEZER_CSS.parser };
    }

    return null;
  }),
});

export function getHTMLMode(
  runtime: RuntimeEnvironment,
  store: DocumentStore,
  cssCompletionItems: LanguageModelCache<CompletionItem[]>
): LanguageMode {
  const trees = getLanguageModelCache(10, 60, runtime, (textDocument) => HTML_CSS_PARSER.parse(textDocument.getText()));

  return {
    getId() {
      return "html";
    },
    async doComplete(document, position) {
      const tree = trees.get(document);

      const cursor = tree.cursorAt(document.offsetAt(position));

      if (
        cursor.type !== htmlNodeTypes[HtmlNodeType.AttributeValue] ||
        !cursor.prevSibling() ||
        cursor.type !== htmlNodeTypes[HtmlNodeType.Is] ||
        !cursor.prevSibling() ||
        cursor.type !== htmlNodeTypes[HtmlNodeType.AttributeName] ||
        getText(document, cursor) !== "class"
      ) {
        return null;
      }

      let urls = new Set<string>();
      let items = new Map<string, CompletionItem>();

      tree.cursor().iterate((ref) => {
        if (ref.type === htmlNodeTypes[HtmlNodeType.SelfClosingTag]) {
          getUrlForLinks(document, ref, urls);
          return false;
        } else if (ref.type === cssNodeTypes[CssNodeType.ClassName]) {
          const label = getText(document, ref);
          if (label) {
            if (items.has(label)) {
              // TODO
            } else {
              items.set(label, {
                label,
                kind: CompletionItemKind.Class,
              });
            }
          }
        }
      });

      let isIncomplete = false;

      const referenceDocuments = store.changeReferenceDocument(document.uri, urls);

      await Promise.all(
        referenceDocuments.map(async (ref) => {
          if (!ref.isOpened && !ref.isLocal) {
            isIncomplete = true;
          } else {
            const doc = await ref.textDocument;
            if (doc) {
              cssCompletionItems.get(doc).forEach((item) => {
                const label = item.label;
                if (items.has(label)) {
                  // TODO
                } else {
                  items.set(label, item);
                }
              });
            }
          }
        })
      );

      return CompletionList.create([...items.values()], isIncomplete);
    },
    async doResolve(document, item) {
      item.detail = item.label;
      return item;
    },
    onDocumentRemoved(document) {
      trees.onDocumentRemoved(document.uri);
    },
    dispose() {
      trees.dispose();
    },
  };
}

function getText(document: TextDocument, node: SyntaxNodeRef) {
  return document.getText().substring(node.from, node.to);
}

function getUrlForLinks(document: TextDocument, ref: SyntaxNodeRef, urls: Set<string>) {
  const node = ref.node;
  const tagNameNode = node.getChild(HtmlNodeType.TagName);
  if (!tagNameNode || getText(document, tagNameNode) !== "link") {
    return;
  }

  const documentUri = URI.parse(document.uri);
  const attrs = node.getChildren(HtmlNodeType.Attribute);

  for (const attr of attrs) {
    if (
      attr.firstChild &&
      attr.firstChild.type === htmlNodeTypes[HtmlNodeType.AttributeName] &&
      attr.lastChild &&
      attr.lastChild.type === htmlNodeTypes[HtmlNodeType.AttributeValue]
    ) {
      if (
        getText(document, attr.firstChild) === "rel" &&
        getText(document, attr.lastChild).slice(1, -1) !== "stylesheet"
      ) {
        return;
      }

      if (getText(document, attr.firstChild) === "href") {
        const href = getText(document, attr.lastChild).slice(1, -1);
        if (href) {
          let uri = URI.parse(href);
          if (uri.scheme === "http" || uri.scheme === "https") {
            urls.add(uri.toString());
          } else if (uri.scheme === "file") {
            uri = Utils.joinPath(documentUri, "..", href);
            urls.add(uri.toString());
          } else if (uri.scheme !== "untitled") {
            urls.add(uri.toString());
          }
        }
      }
    }
  }
}
