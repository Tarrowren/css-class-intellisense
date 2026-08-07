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
import { lspRange, normalize } from "../util";
import { CompletionTriggeredSymbolKind } from "./common";

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
    const uri = normalize(params.textDocument.uri);
    const maybeExpired = this._documents.get(uri);
    if (!maybeExpired) {
      return;
    }

    const language = this._languages.getLanguage(maybeExpired.languageId);
    if (!language || !language.completion) {
      return;
    }

    const { document, tree } = await this._trees.getParseTree(maybeExpired, language, token);
    const info = language.completion(document.getText(), document.offsetAt(params.position), tree);
    if (!info) {
      return;
    }

    await this._symbols.update(token);

    const sourceFile = this._symbols.index.get(uri);
    if (!sourceFile) {
      return;
    }

    let items: Map<string, CompletionItem>;
    switch (info.kind) {
      case CompletionTriggeredSymbolKind.ClassName:
        items = this._collect_definition(sourceFile, "class_names");
        break;
      case CompletionTriggeredSymbolKind.IdName:
        items = this._collect_definition(sourceFile, "id_names");
        break;
      case CompletionTriggeredSymbolKind.Css:
        items = this._collect_reference(uri);
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

  private _collect_definition(sourceFile: SourceFile, prop: "class_names" | "id_names"): Map<string, CompletionItem> {
    const result = new Map<string, CompletionItem>();

    for (const name of sourceFile[prop].keys()) {
      result.set(name, { label: name, kind: CompletionItemKind.Variable });
    }

    for (const uri of sourceFile.refs.keys()) {
      const defSourceFile = this._symbols.index.get(uri);
      if (!defSourceFile) {
        continue;
      }

      for (const name of defSourceFile[prop].keys()) {
        result.set(name, { label: name, kind: CompletionItemKind.Variable });
      }
    }

    return result;
  }

  private _collect_reference(documentUri: DocumentUri): Map<string, CompletionItem> {
    const result = new Map<string, CompletionItem>();

    for (const [uri, refSourceFile] of this._symbols.index) {
      if (refSourceFile.refs.has(documentUri) || documentUri === uri) {
        for (const name of refSourceFile.used_class_names.keys()) {
          result.set(name, { label: "." + name, kind: CompletionItemKind.Variable });
        }
        for (const name of refSourceFile.used_id_names.keys()) {
          result.set(name, { label: "#" + name, kind: CompletionItemKind.Variable });
        }
      }
    }

    return result;
  }
}
