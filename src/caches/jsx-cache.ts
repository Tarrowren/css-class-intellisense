import { Tree } from "@lezer/common";
import * as LEZER_JS from "@lezer/javascript";
import { Range, TextDocument } from "vscode";
import { JS_NODE_TYPE } from "../lezer/javascript";
import { getNameFromAttribute } from "../util/css-class-name";
import { emptyMap } from "../util/empty";
import { getHrefFromImports } from "../util/js-import";
import { getText } from "../util/text-document";
import { LanguageCacheEntry } from "./language-caches";

export class JsxCacheEntry implements LanguageCacheEntry {
  tree: Tree;
  hrefs: Set<string>;
  usedClassNames: Map<string, Range[]>;
  usedIds: Map<string, Range[]>;
  classNames: Map<string, Range[]>;
  ids: Map<string, Range[]>;

  constructor(document: TextDocument, ts = false) {
    this.tree = LEZER_JS.parser.configure({ dialect: ts ? "ts jsx" : "jsx" }).parse(document.getText());

    this.hrefs = new Set();
    this.usedClassNames = new Map();
    this.usedIds = emptyMap();
    this.classNames = emptyMap();
    this.ids = emptyMap();

    this.tree.cursor().iterate((ref) => {
      if (ref.type === JS_NODE_TYPE.ImportDeclaration) {
        getHrefFromImports(document, ref, this.hrefs);
        return false;
      } else if (ref.type === JS_NODE_TYPE.JSXAttribute) {
        const firstChild = ref.node.firstChild;
        const lastChild = ref.node.lastChild;
        if (
          firstChild &&
          lastChild &&
          firstChild.type === JS_NODE_TYPE.JSXIdentifier &&
          lastChild.type === JS_NODE_TYPE.JSXAttributeValue
        ) {
          const attr = getText(document, firstChild);
          if (attr === "className") {
            getNameFromAttribute(document, lastChild, this.usedClassNames);
          }
        }

        return false;
      }
    });
  }
}
