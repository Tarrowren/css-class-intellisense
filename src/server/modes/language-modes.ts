import * as LEZER_CSS from "@lezer/css";
import { CompletionItem, CompletionList, Definition, Location, Position, Range } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { DocumentStore } from "../document/store";
import { CssNodeType, cssNodeTypes } from "../nodetype";
import { RuntimeEnvironment } from "../runner";
import { getLanguageModelCache } from "./cache";
import { getHTMLMode } from "./html-mode";

export function getLanguageModes(runtime: RuntimeEnvironment, store: DocumentStore): LanguageModes {
  const cache = getLanguageModelCache(10, 60, runtime, getCssCacheEntry);

  store.addEventListener((uri) => {
    cache.onDocumentRemoved(uri);
  });

  const html = getHTMLMode(runtime, store, cache);

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
      cache.dispose();
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
  findDefinition?(document: TextDocument, position: Position): Promise<Definition | null>;
  findReferences?: (document: TextDocument, position: Position) => Promise<Location[]>;
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

export interface CssCacheEntry {
  readonly classNameData: Map<string, Range[]>;
}

function getCssCacheEntry(textDocument: TextDocument): CssCacheEntry {
  const content = textDocument.getText();
  const tree = LEZER_CSS.parser.parse(content);

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

  return {
    classNameData,
  };
}
