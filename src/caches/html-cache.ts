import { parseMixed, SyntaxNode, SyntaxNodeRef } from "@lezer/common";
import * as LEZER_CSS from "@lezer/css";
import * as LEZER_HTML from "@lezer/html";
import { Range, TextDocument, Uri } from "vscode";
import { convertToCciHttpScheme } from "../http-file-system";
import { CSS_NODE_TYPE } from "../lezer/css";
import { HTML_NODE_TYPE } from "../lezer/html";
import { getClassNameFromStyle, getIdNameFromStyle } from "../util/css-class-name";
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
  const usedIds = new Map<string, Range[]>();
  const classNames = new Map<string, Range[]>();
  const ids = new Map<string, Range[]>();

  tree.cursor().iterate((ref) => {
    if (ref.type === HTML_NODE_TYPE.SelfClosingTag) {
      getHrefFromLinks(document, ref, hrefs);
      return false;
    } else if (ref.type === HTML_NODE_TYPE.Attribute) {
      const firstChild = ref.node.firstChild;
      const lastChild = ref.node.lastChild;
      if (
        firstChild &&
        lastChild &&
        firstChild.type === HTML_NODE_TYPE.AttributeName &&
        lastChild.type === HTML_NODE_TYPE.AttributeValue
      ) {
        const attr = getText(document, firstChild);
        if (attr === "class") {
          getClassNameFromAttribute(document, lastChild, usedClassNames);
        } else if (attr === "id") {
          getIdNameFromAttribute(document, lastChild, usedIds);
        }
      }

      return false;
    } else if (ref.type === CSS_NODE_TYPE.ClassName) {
      getClassNameFromStyle(document, ref, classNames);
    } else if (ref.type === CSS_NODE_TYPE.IdName) {
      getIdNameFromStyle(document, ref, ids);
    }
  });

  return {
    tree,
    hrefs,
    usedClassNames,
    usedIds,
    classNames,
    ids,
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
      hrefs.add(convertToCciHttpScheme(uri).toString(true));
    } else if (uri.scheme === "file") {
      hrefs.add(Uri.joinPath(document.uri, "..", uri.path).toString(true));
    }
  }
}

function getClassNameFromAttribute(
  document: TextDocument,
  attrValueNode: SyntaxNode,
  classNames: Map<string, Range[]>
) {
  const value = getText(document, attrValueNode);

  let start = 1;
  let end = 1;
  for (let i = 1; i < value.length; i++) {
    if (isEmptyCode(value.charCodeAt(i)) || i === value.length - 1) {
      if (start < end) {
        const className = value.substring(start, end);
        const range = new Range(
          document.positionAt(attrValueNode.from + start),
          document.positionAt(attrValueNode.from + end)
        );
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

function getIdNameFromAttribute(document: TextDocument, attrValueNode: SyntaxNode, ids: Map<string, Range[]>) {
  const value = getText(document, attrValueNode);

  let start = 1;
  let end = 1;
  for (let i = 1; i < value.length; i++) {
    if (isEmptyCode(value.charCodeAt(i)) || i === value.length - 1) {
      if (start < end) {
        const idName = value.substring(start, end);
        const range = new Range(
          document.positionAt(attrValueNode.from + start),
          document.positionAt(attrValueNode.from + end)
        );
        const ranges = ids.get(idName);
        if (ranges) {
          ranges.push(range);
        } else {
          ids.set(idName, [range]);
        }
        return;
      }
    } else {
      end++;
    }
  }
}
