import { parseMixed, SyntaxNode, SyntaxNodeRef, TreeCursor } from "@lezer/common";
import * as LEZER_CSS from "@lezer/css";
import * as LEZER_HTML from "@lezer/html";
import { CompletionItem, CompletionItemKind, CompletionList, Range, TextDocument } from "vscode";
import { createLanguageModelCache } from "../caches/cache";
import { CSS_NODE_TYPE } from "../lezer/css";
import { HTML_NODE_TYPE } from "../lezer/html";
import { RuntimeEnvironment } from "../runner";
import { LanguageMode } from "./language-modes";

const HTML_PARSER = LEZER_HTML.parser.configure({
  wrap: parseMixed((node) => {
    if (node.type === HTML_NODE_TYPE.StyleText) {
      return { parser: LEZER_CSS.parser };
    }

    return null;
  }),
});

export function createHtmlMode(runtime: RuntimeEnvironment): LanguageMode {
  const id = "html";
  const cache = createLanguageModelCache(runtime, 10, 60, (document) => {
    const content = document.getText();
    const tree = HTML_PARSER.parse(content);
    return tree;
  });

  return {
    get id() {
      return id;
    },
    async doComplete(document, position) {
      const tree = cache.get(document);

      const cursor = tree.cursorAt(document.offsetAt(position));

      if (!isClassAttributeValue(document, cursor)) {
        return;
      }

      const items = new Map<string, CompletionItem>();

      tree.cursor().iterate((ref) => {
        if (ref.type === CSS_NODE_TYPE.ClassName) {
          const label = getText(document, ref);
          if (label) {
            items.set(label, new CompletionItem(label, CompletionItemKind.Class));
          }
        }
      });

      return new CompletionList([...items.values()], false);
    },
    onDocumentRemoved(document) {
      cache.onDocumentRemoved(document);
    },
    dispose() {
      cache.dispose();
    },
  };
}

function isClassAttributeValue(document: TextDocument, cursor: TreeCursor) {
  let node: SyntaxNode | null = cursor.node;
  if (
    node.type !== HTML_NODE_TYPE.AttributeValue ||
    !(node = node.prevSibling) ||
    node.type !== HTML_NODE_TYPE.Is ||
    !(node = node.prevSibling) ||
    node.type !== HTML_NODE_TYPE.AttributeName ||
    getText(document, node) !== "class"
  ) {
    return false;
  }

  return true;
}

function getText(document: TextDocument, node: SyntaxNodeRef): string {
  return document.getText(new Range(document.positionAt(node.from), document.positionAt(node.to)));
}
