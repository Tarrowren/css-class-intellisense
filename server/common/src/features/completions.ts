import {
  CancellationToken,
  CompletionItemKind,
  Range,
  type CompletionItem,
  type CompletionList,
  type CompletionParams,
  type DocumentUri,
} from "vscode-languageserver";
import type { DocumentStore } from "../document-store";
import type { Languages } from "../languages";
import type { SymbolIndex } from "../symbol-index";
import type { Trees } from "../trees";
import type { SourceFile } from "../type";
import { lspRange } from "../util";
import { CompletionTriggeredSymbolKind } from "./common";
import { URI } from "vscode-uri";

export class CompletionItemProvider {
  constructor(
    private readonly _languages: Languages,
    private readonly _documents: DocumentStore,
    private readonly _trees: Trees,
    private readonly _symbols: SymbolIndex,
  ) {}

  async provideCompletionItems(
    params: CompletionParams,
    token: CancellationToken,
  ): Promise<CompletionList | undefined> {
    const uri = URI.parse(params.textDocument.uri).toString(true);
    const document = this._documents.get(uri);
    if (!document) {
      return;
    }

    const language = this._languages.getLanguage(document.languageId);
    if (!language || !language.getCompletionTriggeredSymbolInfo) {
      return;
    }

    const tree = await this._trees.getParseTree(document, language);
    if (token.isCancellationRequested) {
      return;
    }
    const info = language.getCompletionTriggeredSymbolInfo(
      document.getText(),
      document.offsetAt(params.position),
      tree,
    );
    if (!info) {
      return;
    }

    await this._symbols.update();
    if (token.isCancellationRequested) {
      return;
    }
    const sourceFile = this._symbols.index.get(uri);
    if (!sourceFile) {
      return;
    }

    let items: Map<string, CompletionItem>;
    switch (info.kind) {
      case CompletionTriggeredSymbolKind.ClassName:
        items = this._collectDefinition(sourceFile, "class_names");
        break;
      case CompletionTriggeredSymbolKind.IdName:
        items = this._collectDefinition(sourceFile, "id_names");
        break;
      case CompletionTriggeredSymbolKind.Css:
        items = this._collectReference(uri);
        break;
    }

    if (items.size === 0) {
      return;
    }

    let editRange: Range | undefined;
    if (info.editRange) {
      editRange = lspRange(document, info.editRange);
    }

    return { isIncomplete: false, itemDefaults: { editRange }, items: [...items.values()] };
  }

  private _collectDefinition(sourceFile: SourceFile, prop: "class_names" | "id_names"): Map<string, CompletionItem> {
    const result = new Map<string, CompletionItem>();

    for (const name of sourceFile[prop].keys()) {
      result.set(name, { label: name, kind: CompletionItemKind.Variable });
    }

    for (const _uri of sourceFile.refs.keys()) {
      const _sourceFile = this._symbols.index.get(_uri);
      if (!_sourceFile) {
        continue;
      }

      for (const name of _sourceFile[prop].keys()) {
        result.set(name, { label: name, kind: CompletionItemKind.Variable });
      }
    }

    return result;
  }

  private _collectReference(uri: DocumentUri): Map<string, CompletionItem> {
    const result = new Map<string, CompletionItem>();

    for (const [_uri, _sourceFile] of this._symbols.index) {
      if (_sourceFile.refs.has(uri) || uri === _uri) {
        for (const name of _sourceFile.used_class_names.keys()) {
          result.set(name, { label: "." + name, kind: CompletionItemKind.Variable });
        }
        for (const name of _sourceFile.used_id_names.keys()) {
          result.set(name, { label: "#" + name, kind: CompletionItemKind.Variable });
        }
      }
    }

    return result;
  }
}
