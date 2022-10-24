import * as LEZER_CSS from "@lezer/css";
import { Range } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { CssNodeType, cssNodeTypes } from "../nodetype";
import { LanguageCacheEntry } from "./language-caches";

export function getCSSCacheEntry(textDocument: TextDocument): LanguageCacheEntry {
  const content = textDocument.getText();
  const tree = LEZER_CSS.parser.parse(content);

  let _classNameData: Map<string, Range[]> | undefined;

  function init() {
    const classNameData = new Map<string, Range[]>();

    tree.cursor().iterate((ref) => {
      if (ref.type === cssNodeTypes[CssNodeType.ClassName]) {
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
  };
}
