import { parseMixed, SyntaxNode, SyntaxNodeRef, Tree, TreeCursor } from "@lezer/common";
import * as LEZER_CSS from "@lezer/css";
import * as LEZER_HTML from "@lezer/html";
import { CompletionItem, CompletionItemKind, CompletionList, Definition, Location, Range } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { URI, Utils } from "vscode-uri";
import { DocumentStore } from "../document/store";
import { CssNodeType, cssNodeTypes, HtmlNodeType, htmlNodeTypes } from "../nodetype";
import { RuntimeEnvironment } from "../runner";
import { nearby } from "../utils/string";
import { getLanguageModelCache, LanguageModelCache } from "./cache";
import { CssCacheEntry, LanguageMode } from "./language-modes";

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
  cssLanguageModelCache: LanguageModelCache<CssCacheEntry>
): LanguageMode {
  const cache = getLanguageModelCache(10, 60, runtime, getHtmlCacheEntry);

  return {
    getId() {
      return "html";
    },
    async doComplete(document, position) {
      const entry = cache.get(document);

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

      const referenceDocuments = store.changeReferenceDocument(document.uri, entry.urls);
      let isIncomplete = false;

      await Promise.all(
        referenceDocuments.map(async (ref) => {
          if (!ref.isOpened && !ref.isLocal) {
            isIncomplete = true;
            return;
          }

          const doc = await ref.textDocument;
          if (!doc) {
            return;
          }

          cssLanguageModelCache.get(doc).classNameData.forEach((_v, label) => {
            if (!items.has(label)) {
              items.set(label, {
                label,
                kind: CompletionItemKind.Class,
              });
            }
          });
        })
      );

      return CompletionList.create([...items.values()], isIncomplete);
    },
    async findDefinition(document, position) {
      const entry = cache.get(document);

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

      const referenceDocuments = store.changeReferenceDocument(document.uri, entry.urls);
      await Promise.all(
        referenceDocuments.map(async (ref) => {
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

          cssLanguageModelCache
            .get(doc)
            .classNameData.get(className)
            ?.forEach((range) => {
              definition.push(Location.create(uri, range));
            });
        })
      );

      return definition;
    },
    onDocumentRemoved(document) {
      cache.onDocumentRemoved(document.uri);
    },
    dispose() {
      cache.dispose();
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

function getHtmlCacheEntry(textDocument: TextDocument): HtmlCacheEntry {
  const content = textDocument.getText();
  const tree = HTML_CSS_PARSER.parse(content);

  let _classNameData: Map<string, Range[]> | undefined;
  let _urls: Set<string> | undefined;

  function init() {
    const classNameData = new Map<string, Range[]>();
    const urls = new Set<string>();

    tree.cursor().iterate((ref) => {
      if (ref.type === htmlNodeTypes[HtmlNodeType.SelfClosingTag]) {
        getUrlForLinks(textDocument, ref, urls);
        return false;
      } else if (ref.type === cssNodeTypes[CssNodeType.ClassName]) {
        const label = content.substring(ref.from, ref.to);
        if (label) {
          const range = Range.create(textDocument.positionAt(ref.from), textDocument.positionAt(ref.to));
          const data = classNameData.get(label);
          if (data) {
            data.push(range);
          } else {
            classNameData.set(label, [range]);
          }
        }
      }
    });

    _classNameData = classNameData;
    _urls = urls;
  }

  return {
    tree,
    get classNameData() {
      if (!_classNameData) {
        init();
      }

      return _classNameData!;
    },
    get urls() {
      if (!_urls) {
        init();
      }

      return _urls!;
    },
  };
}

interface HtmlCacheEntry {
  tree: Tree;
  readonly classNameData: Map<string, Range[]>;
  readonly urls: Set<string>;
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

function getText(document: TextDocument, node: SyntaxNodeRef) {
  return document.getText().substring(node.from, node.to);
}
