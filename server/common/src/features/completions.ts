import {
  CompletionItemKind,
  Range,
  type CompletionItem,
  type CompletionList,
  type CompletionParams,
} from "vscode-languageserver";
import type { DocumentStore } from "../document-store";
import type { Languages } from "../languages";
import type { SymbolIndex } from "../symbol-index";
import type { Trees } from "../trees";
import type { SourceFile, SymbolRange } from "../type";
import { lspRange } from "../util";

export class CompletionItemProvider {
  constructor(
    private readonly _languages: Languages,
    private readonly _documents: DocumentStore,
    private readonly _trees: Trees,
    private readonly _symbols: SymbolIndex,
  ) {}

  async provideCompletionItems(params: CompletionParams): Promise<CompletionList | undefined> {
    const uri = params.textDocument.uri;
    const document = this._documents.get(uri);
    if (!document) {
      return;
    }

    const language = this._languages.getLanguage(document.languageId);
    if (!language) {
      return;
    }

    const tree = await this._trees.getParseTree(document, language);
    const completionSymbolInfo = language.getCompletionSymbolInfo(
      document.getText(),
      document.offsetAt(params.position),
      tree,
    );
    if (!completionSymbolInfo) {
      return;
    }

    await this._symbols.update();
    const sourceFile = this._symbols.index.get(uri);
    if (!sourceFile) {
      return;
    }

    const tmp = new Map<string, CompletionItem>();
    switch (completionSymbolInfo.kind) {
      case CompletionSymbolKind.Class:
        this._collectDefinition(sourceFile, "class_names", tmp);
        break;
      case CompletionSymbolKind.Id:
        this._collectDefinition(sourceFile, "id_names", tmp);
        break;
      case CompletionSymbolKind.Css:
        this._collectUsed(sourceFile, tmp);
        for (const refSourceFile of this._symbols.index.values()) {
          if (refSourceFile.refs.has(uri)) {
            this._collectUsed(refSourceFile, tmp);
          }
        }
        break;
    }

    if (tmp.size === 0) {
      return;
    }

    let lspEditRange: Range | undefined;
    if (completionSymbolInfo.editRange) {
      lspEditRange = lspRange(document, completionSymbolInfo.editRange);
    }

    return {
      isIncomplete: false,
      itemDefaults: { editRange: lspEditRange },
      items: [...tmp.values()],
    };
  }

  private _collectDefinition(
    sourceFile: SourceFile,
    prop: "class_names" | "id_names",
    tmp: Map<string, CompletionItem>,
  ) {
    for (const [name] of sourceFile[prop]) {
      tmp.set(name, { label: name, kind: CompletionItemKind.Variable });
    }

    for (const defSourceFileUri of sourceFile.refs) {
      const defSourceFile = this._symbols.index.get(defSourceFileUri);
      if (!defSourceFile) {
        continue;
      }

      for (const [name] of defSourceFile[prop]) {
        tmp.set(name, { label: name, kind: CompletionItemKind.Variable });
      }
    }
  }

  private _collectUsed(sourceFile: SourceFile, tmp: Map<string, CompletionItem>) {
    for (const [name] of sourceFile.used_class_names) {
      tmp.set(name, { label: "." + name, kind: CompletionItemKind.Variable });
    }
    for (const [name] of sourceFile.used_id_names) {
      tmp.set(name, { label: "#" + name, kind: CompletionItemKind.Variable });
    }
  }
}

export interface CompletionSymbolInfo {
  kind: CompletionSymbolKind;
  editRange?: SymbolRange;
}

export enum CompletionSymbolKind {
  Class,
  Id,
  Css,
}
