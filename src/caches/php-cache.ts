import { SyntaxNodeRef, Tree, parseMixed } from "@lezer/common";
import * as LEZER_CSS from "@lezer/css";
import * as LEZER_HTML from "@lezer/html";
import * as LEZER_PHP from "@lezer/php";
import { Range, TextDocument, Uri } from "vscode";
import { HTTPS_SCHEME, HTTP_SCHEME, convertToHttpSchemeEx } from "../http-file-system";
import { CSS_NODE_TYPE } from "../lezer/css";
import { HTML_NODE_TYPE } from "../lezer/html";
import { PHP_NODE_TYPE } from "../lezer/php";
import { getNameFromAttribute, getNameFromStyle } from "../util/css-class-name";
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

const PHP_PARSER = LEZER_PHP.parser.configure({
  wrap: parseMixed((node) => {
    if (node.type === PHP_NODE_TYPE.Text) {
      return { parser: HTML_PARSER };
    }

    return null;
  }),
});

export class PhpCacheEntry implements LanguageCacheEntry {
  tree: Tree;
  hrefs: Set<string>;
  usedClassNames: Map<string, Range[]>;
  usedIds: Map<string, Range[]>;
  classNames: Map<string, Range[]>;
  ids: Map<string, Range[]>;

  constructor(private document: TextDocument) {
    this.tree = PHP_PARSER.parse(document.getText());

    this.hrefs = new Set<string>();
    this.usedClassNames = new Map<string, Range[]>();
    this.usedIds = new Map<string, Range[]>();
    this.classNames = new Map<string, Range[]>();
    this.ids = new Map<string, Range[]>();

    this.tree.cursor().iterate((ref) => {
      if (ref.type === HTML_NODE_TYPE.SelfClosingTag) {
        this.getHrefFromLinks(ref);
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
            getNameFromAttribute(document, lastChild, this.usedClassNames);
          } else if (attr === "id") {
            getNameFromAttribute(document, lastChild, this.usedIds, true);
          }
        }

        return false;
      } else if (ref.type === CSS_NODE_TYPE.ClassName) {
        getNameFromStyle(document, ref, this.classNames);
      } else if (ref.type === CSS_NODE_TYPE.IdName) {
        getNameFromStyle(document, ref, this.ids);
      }
    });
  }

  private getHrefFromLinks(ref: SyntaxNodeRef) {
    const node = ref.node;
    const tagNameNode = node.getChild(HTML_NODE_TYPE.TagName.id);
    if (!tagNameNode || getText(this.document, tagNameNode) !== "link") {
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
          getText(this.document, attribute.firstChild) === "rel" &&
          getText(this.document, attribute.lastChild).slice(1, -1) !== "stylesheet"
        ) {
          return;
        }

        if (getText(this.document, attribute.firstChild) === "href") {
          href = getText(this.document, attribute.lastChild).slice(1, -1);
        }
      }
    }

    if (href) {
      const uri = Uri.parse(href);
      if (uri.scheme === HTTP_SCHEME || uri.scheme === HTTPS_SCHEME) {
        this.hrefs.add(convertToHttpSchemeEx(uri).toString(true));
      } else if (uri.scheme === "file") {
        this.hrefs.add(Uri.joinPath(this.document.uri, "..", uri.path).toString(true));
      }
    }
  }
}
