import { parseMixed, SyntaxNodeRef } from "@lezer/common";
import * as LEZER_CSS from "@lezer/css";
import * as LEZER_HTML from "@lezer/html";
import { Range, TextDocument, Uri } from "vscode";
import { CSS_NODE_TYPE } from "../lezer/css";
import { HTML_NODE_TYPE } from "../lezer/html";
import { getClassNameFromStyle } from "../util/css-class-name";
import { isEmptyCode } from "../util/string";
import { getText } from "../util/text-document";
import { LanguageCacheEntry } from "./language-caches";

const HTML_PARSER = LEZER_HTML.parser.configure({
  wrap: parseMixed((node) => {
    if (node.type === HTML_NODE_TYPE.StyleText) {
      return { parser: LEZER_CSS.parser };
    }

    return null;
  }),
});

export function getHtmlCacheEntry(document: TextDocument): LanguageCacheEntry {
  const tree = HTML_PARSER.parse(document.getText());

  const hrefs = new Set<string>();
  const usedClassNames = new Map<string, Range[]>();
  const classNames = new Map<string, Range[]>();

  tree.cursor().iterate((ref) => {
    if (ref.type === HTML_NODE_TYPE.SelfClosingTag) {
      getHrefFromLinks(document, ref, hrefs);
      return false;
    } else if (ref.type === HTML_NODE_TYPE.Attribute) {
      getClassNameFromAttribute(document, ref, usedClassNames);
      return false;
    } else if (ref.type === CSS_NODE_TYPE.ClassName) {
      getClassNameFromStyle(document, ref, classNames);
    }
  });

  return {
    tree,
    hrefs,
    usedClassNames,
    classNames,
  };
}

function getHrefFromLinks(document: TextDocument, ref: SyntaxNodeRef, hrefs: Set<string>) {
  const node = ref.node;
  const tagNameNode = node.getChild(HTML_NODE_TYPE.TagName.id);
  if (!tagNameNode || getText(document, tagNameNode) !== "link") {
    return;
  }

  const attributes = node.getChildren(HTML_NODE_TYPE.Attribute.id);
  let href: string | undefined;
  for (const attribute of attributes) {
    if (
      attribute.firstChild &&
      attribute.firstChild.type === HTML_NODE_TYPE.AttributeName &&
      attribute.lastChild &&
      attribute.lastChild.type === HTML_NODE_TYPE.AttributeValue
    ) {
      if (
        getText(document, attribute.firstChild) === "rel" &&
        getText(document, attribute.lastChild).slice(1, -1) !== "stylesheet"
      ) {
        return;
      }

      if (getText(document, attribute.firstChild) === "href") {
        href = getText(document, attribute.lastChild).slice(1, -1);
      }
    }
  }

  if (href) {
    const uri = Uri.parse(href);
    if (uri.scheme === "http" || uri.scheme === "https") {
      hrefs.add(uri.toString(true));
    } else if (uri.scheme === "file") {
      hrefs.add(Uri.joinPath(document.uri, "..", uri.path).toString(true));
    }
  }
}

function getClassNameFromAttribute(document: TextDocument, ref: SyntaxNodeRef, classNames: Map<string, Range[]>) {
  const node = ref.node;

  const firstChild = node.firstChild;
  if (!firstChild || firstChild.type !== HTML_NODE_TYPE.AttributeName || getText(document, firstChild) !== "class") {
    return;
  }

  const lastChild = node.lastChild;
  if (!lastChild || lastChild.type !== HTML_NODE_TYPE.AttributeValue) {
    return;
  }

  const attribute = getText(document, lastChild);

  let start = 1;
  let end = 1;
  for (let i = 1; i < attribute.length; i++) {
    if (isEmptyCode(attribute.charCodeAt(i)) || i === attribute.length - 1) {
      if (start < end) {
        const className = attribute.substring(start, end);
        const range = new Range(document.positionAt(lastChild.from + start), document.positionAt(lastChild.from + end));
        const ranges = classNames.get(className);
        if (ranges) {
          ranges.push(range);
        } else {
          classNames.set(className, [range]);
        }
      }

      start = i + 1;
      end = start;
    } else {
      end++;
    }
  }
}
