import { parseMixed, SyntaxNodeRef } from "@lezer/common";
import * as LEZER_CSS from "@lezer/css";
import * as LEZER_HTML from "@lezer/html";
import * as LEZER_JS from "@lezer/javascript";
import { Range, TextDocument, Uri } from "vscode";
import { convertToCciHttpScheme } from "../http-file-system";
import { CSS_NODE_TYPE } from "../lezer/css";
import { HTML_NODE_TYPE } from "../lezer/html";
import { JS_NODE_TYPE } from "../lezer/javascript";
import { getClassNameFromStyle } from "../util/css-class-name";
import { isEmptyCode } from "../util/string";
import { getText } from "../util/text-document";
import { LanguageCacheEntry } from "./language-caches";

const VUE_PARSER = LEZER_HTML.parser.configure({
  wrap: parseMixed((node) => {
    if (node.type === HTML_NODE_TYPE.ScriptText) {
      return { parser: LEZER_JS.parser };
    } else if (node.type === HTML_NODE_TYPE.StyleText) {
      return { parser: LEZER_CSS.parser };
    } else {
      return null;
    }
  }),
});

export function getVueCacheEntry(document: TextDocument): LanguageCacheEntry {
  const tree = VUE_PARSER.parse(document.getText());

  const hrefs = new Set<string>();
  const usedClassNames = new Map<string, Range[]>();
  const classNames = new Map<string, Range[]>();

  tree.cursor().iterate((ref) => {
    if (ref.type === JS_NODE_TYPE.ImportDeclaration) {
      getHrefFromImports(document, ref, hrefs);
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

function getHrefFromImports(document: TextDocument, ref: SyntaxNodeRef, hrefs: Set<string>) {
  const importNode = ref.node.firstChild;
  if (!importNode || importNode.type !== JS_NODE_TYPE.Import) {
    return;
  }

  const stringNode = importNode.nextSibling;
  if (!stringNode || stringNode.type !== JS_NODE_TYPE.String) {
    return;
  }

  const href = getText(document, stringNode).slice(1, -1);
  if (href) {
    const uri = Uri.parse(href);
    if (uri.scheme === "http" || uri.scheme === "https") {
      hrefs.add(convertToCciHttpScheme(uri).toString(true));
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
