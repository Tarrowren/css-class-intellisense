import { parseMixed, SyntaxNodeRef } from "@lezer/common";
import * as LEZER_CSS from "@lezer/css";
import * as LEZER_HTML from "@lezer/html";
import { Range } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { URI, Utils } from "vscode-uri";
import { CssNodeType, cssNodeTypes, HtmlNodeType, htmlNodeTypes } from "../nodetype";
import { getClassNameRange } from "../utils/css-class-name";
import { getText, isEmptyCode } from "../utils/string";
import { LanguageCacheEntry } from "./language-caches";

const HTML_CSS_PARSER = LEZER_HTML.parser.configure({
  wrap: parseMixed((node) => {
    if (node.type === htmlNodeTypes[HtmlNodeType.StyleText]) {
      return { parser: LEZER_CSS.parser };
    }

    return null;
  }),
});

export function getHTMLCacheEntry(textDocument: TextDocument): LanguageCacheEntry {
  const content = textDocument.getText();
  const tree = HTML_CSS_PARSER.parse(content);

  let _classNameData: Map<string, Range[]> | undefined;
  let _classAttributeData: Map<string, Range[]> | undefined;
  let _linkUrls: Set<string> | undefined;

  function init() {
    const classNameData = new Map<string, Range[]>();
    const classAttributeData = new Map<string, Range[]>();
    const linkUrls = new Set<string>();

    tree.cursor().iterate((ref) => {
      if (ref.type === htmlNodeTypes[HtmlNodeType.SelfClosingTag]) {
        getUrlForLinks(textDocument, ref, linkUrls);
        return false;
      } else if (ref.type === cssNodeTypes[CssNodeType.ClassName]) {
        getClassNameRange(textDocument, ref, classNameData);
      } else if (ref.type === htmlNodeTypes[HtmlNodeType.Attribute]) {
        getClassAttributeValues(textDocument, ref, classAttributeData);
        return false;
      }
    });

    _classNameData = classNameData;
    _classAttributeData = classAttributeData;
    _linkUrls = linkUrls;
  }

  return {
    get tree() {
      return tree;
    },
    get classNameData() {
      if (!_classNameData) {
        init();
      }

      return _classNameData!;
    },
    get classAttributeData() {
      if (!_classAttributeData) {
        init();
      }

      return _classAttributeData!;
    },
    get linkUrls() {
      if (!_linkUrls) {
        init();
      }

      return _linkUrls!;
    },
  };
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

function getClassAttributeValues(document: TextDocument, ref: SyntaxNodeRef, classAttributeData: Map<string, Range[]>) {
  const node = ref.node;

  const firstChild = node.firstChild;
  if (
    !firstChild ||
    firstChild.type !== htmlNodeTypes[HtmlNodeType.AttributeName] ||
    getText(document, firstChild) !== "class"
  ) {
    return;
  }

  const lastChild = node.lastChild;
  if (!lastChild || lastChild.type !== htmlNodeTypes[HtmlNodeType.AttributeValue]) {
    return;
  }

  const attribute = getText(document, lastChild);

  let start = 1;
  let end = 1;
  for (let i = 1; i < attribute.length; i++) {
    if (isEmptyCode(attribute.charCodeAt(i)) || i === attribute.length - 1) {
      if (start < end) {
        const className = attribute.substring(start, end);
        const range = Range.create(
          document.positionAt(lastChild.from + start),
          document.positionAt(lastChild.from + end)
        );

        const ranges = classAttributeData.get(className);
        if (ranges) {
          ranges.push(range);
        } else {
          classAttributeData.set(className, [range]);
        }
      }

      start = i + 1;
      end = start;
    } else {
      end++;
    }
  }
}
