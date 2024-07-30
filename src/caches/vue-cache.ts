import { parseMixed, Tree } from "@lezer/common";
import * as LEZER_CSS from "@lezer/css";
import * as LEZER_HTML from "@lezer/html";
import * as LEZER_JS from "@lezer/javascript";
import { Range, TextDocument } from "vscode";
import { CSS_NODE_TYPE } from "../lezer/css";
import { HTML_NODE_TYPE } from "../lezer/html";
import { JS_NODE_TYPE } from "../lezer/javascript";
import { getNameFromAttribute, getNameFromStyle } from "../util/css-class-name";
import { getHrefFromImports } from "../util/js-import";
import { getText } from "../util/text-document";
import { LanguageCacheEntry } from "./language-caches";

const VUE_PARSER = LEZER_HTML.parser.configure({
  dialect: "selfClosing",
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

export class VueCacheEntry implements LanguageCacheEntry {
  tree: Tree;
  hrefs: Set<string>;
  usedClassNames: Map<string, Range[]>;
  usedIds: Map<string, Range[]>;
  classNames: Map<string, Range[]>;
  ids: Map<string, Range[]>;

  constructor(document: TextDocument) {
    this.tree = VUE_PARSER.parse(document.getText());

    this.hrefs = new Set<string>();
    this.usedClassNames = new Map<string, Range[]>();
    this.usedIds = new Map<string, Range[]>();
    this.classNames = new Map<string, Range[]>();
    this.ids = new Map<string, Range[]>();

    this.tree.cursor().iterate((ref) => {
      if (ref.type === JS_NODE_TYPE.ImportDeclaration) {
        getHrefFromImports(document, ref, this.hrefs);
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
}
