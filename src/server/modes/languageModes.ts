import * as LEZER_CSS from "@lezer/css";
import { CompletionItem, CompletionItemKind, CompletionList, Position } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { DocumentStore } from "../document/store";
import { CssNodeType, cssNodeTypes } from "../nodetype";
import { RuntimeEnvironment } from "../runner";
import { getLanguageModelCache } from "./cache";
import { getHTMLMode } from "./htmlMode";

export function getLanguageModes(runtime: RuntimeEnvironment, store: DocumentStore): LanguageModes {
  const cssCompletionItems = getLanguageModelCache(10, 60, runtime, (document) => {
    return getCompletionItems(document.getText());
  });

  store.addEventListener((uri) => {
    cssCompletionItems.onDocumentRemoved(uri);
  });

  const html = getHTMLMode(runtime, store, cssCompletionItems);

  const modes = new Map<string, LanguageMode>();
  modes.set(html.getId(), html);

  return {
    getMode(languageId) {
      return modes.get(languageId);
    },
    onDocumentRemoved(document) {
      for (const mode of modes.values()) {
        mode.onDocumentRemoved(document);
      }
    },
    dispose() {
      cssCompletionItems.dispose();
      for (const mode of modes.values()) {
        mode.dispose();
      }
      modes.clear();
    },
  };
}

export interface LanguageMode {
  getId(): string;
  doComplete?(document: TextDocument, position: Position): Promise<CompletionList | null>;
  doResolve?(document: TextDocument, item: CompletionItem): Promise<CompletionItem>;
  onDocumentRemoved(document: TextDocument): void;
  dispose(): void;
}

export interface LanguageModes {
  getMode(languageId: string): LanguageMode | undefined;
  onDocumentRemoved(document: TextDocument): void;
  dispose(): void;
}

export function isCompletionItemData(value: any): value is CompletionItemData {
  return (
    value && typeof value.languageId === "string" && typeof value.uri === "string" && typeof value.offset === "number"
  );
}

export type CompletionItemData = {
  languageId: string;
  uri: string;
  offset: number;
};

function getCompletionItems(content: string): CompletionItem[] {
  const tree = LEZER_CSS.parser.parse(content);

  const items = new Map<string, CompletionItem>();

  tree.cursor().iterate((ref) => {
    if (ref.type === cssNodeTypes[CssNodeType.ClassName]) {
      const label = content.substring(ref.from, ref.to);
      if (label) {
        if (items.has(label)) {
          // TODO
        } else {
          items.set(label, {
            label,
            kind: CompletionItemKind.Class,
          });
        }
      }
    }
  });

  return [...items.values()];
}
