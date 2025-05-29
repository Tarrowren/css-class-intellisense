import type { SyntaxNodeRef } from "@lezer/common";
import type {
  CancellationToken,
  DocumentUri,
  Position,
  PrepareRenameParams,
  Range,
  RenameParams,
  TextEdit,
  WorkspaceEdit,
} from "vscode-languageserver";
import type { DocumentStore } from "../document-store";
import { Empty } from "../empty";
import type { Languages } from "../languages";
import type { SymbolIndex } from "../symbol-index";
import type { Trees } from "../trees";
import type { SourceFile } from "../type";
import { lspRange, parallel } from "../util";
import { TriggeredSymbolKind, type TriggeredSymbolInfo } from "./common";

export class RenameProvider {
  constructor(
    private readonly _languages: Languages,
    private readonly _documents: DocumentStore,
    private readonly _trees: Trees,
    private readonly _symbols: SymbolIndex,
  ) {}

  async prepareRename(params: PrepareRenameParams): Promise<Range | { defaultBehavior: boolean }> {
    const range = await this._prepareRename(params.textDocument.uri, params.position);
    return range ?? { defaultBehavior: true };
  }

  private async _prepareRename(uri: DocumentUri, position: Position): Promise<Range | undefined> {
    const document = this._documents.get(uri);
    if (!document) {
      return;
    }

    const language = this._languages.getLanguage(document.languageId);
    if (!language) {
      return;
    }

    const tree = await this._trees.getParseTree(document, language);
    const pos = document.offsetAt(position);

    const renameSymbolInfo =
      this._getInfo(tree.resolve(pos, -1)) ??
      this._getInfo(tree.resolve(pos, 1)) ??
      this._getInfo(tree.resolve(pos + 1, 1));
    if (!renameSymbolInfo) {
      return;
    }

    return lspRange(document, renameSymbolInfo.range);
  }

  async provideRenameEdits(params: RenameParams): Promise<WorkspaceEdit | undefined> {
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
    const pos = document.offsetAt(params.position);

    const info =
      this._getInfo(tree.resolve(pos, -1)) ??
      this._getInfo(tree.resolve(pos, 1)) ??
      this._getInfo(tree.resolve(pos + 1, 1));
    if (!info) {
      return;
    }

    await this._symbols.update();
    const sourceFile = this._symbols.index.get(uri);
    if (!sourceFile) {
      return;
    }

    const name = document.getText().substring(...info.range);
    const changes = await this._provideRenameEdits(uri, sourceFile, info.kind, name, params.newName);
    return { changes };
  }

  private _getInfo(node: SyntaxNodeRef): TriggeredSymbolInfo | undefined {
    if (node.type.is("ClassName") || node.type.is("UsedClassName")) {
      return { kind: TriggeredSymbolKind.ClassName, range: [node.from, node.to] };
    }
    if (node.type.is("IdName") || node.type.is("UsedIdName")) {
      return { kind: TriggeredSymbolKind.IdName, range: [node.from, node.to] };
    }
  }

  private async _provideRenameEdits(
    uri: DocumentUri,
    sourceFile: SourceFile,
    kind: TriggeredSymbolKind,
    name: string,
    newText: string,
  ): Promise<Record<DocumentUri, TextEdit[]>> {
    let defProp: "class_names" | "id_names";
    let refProp: "used_class_names" | "used_id_names";
    switch (kind) {
      case TriggeredSymbolKind.ClassName:
        defProp = "class_names";
        refProp = "used_class_names";
        break;
      case TriggeredSymbolKind.IdName:
        defProp = "id_names";
        refProp = "used_id_names";
        break;
    }

    const tasks: ((token?: CancellationToken) => Promise<[DocumentUri, TextEdit[]]>)[] = [];
    for (const [_uri, _sourceFile] of this._symbols.index) {
      if (_sourceFile.refs.has(uri) || sourceFile.refs.has(_uri) || uri === _uri) {
        const defRanges = _sourceFile[defProp].get(name);
        const refRanges = _sourceFile[refProp].get(name);

        if (defRanges || refRanges) {
          tasks.push(async () => {
            const document = await this._documents.retrieve(_uri);
            const edits = [...(defRanges ?? Empty.array()), ...(refRanges ?? Empty.array())].map<TextEdit>((range) => ({
              range: lspRange(document, range),
              newText,
            }));
            return [_uri, edits];
          });
        }
      }
    }

    const result = await parallel(tasks, 32);
    return Object.fromEntries(result);
  }
}
