import type { SyntaxNodeRef } from "@lezer/common";
import { Location, type CancellationToken, type DefinitionParams, type DocumentUri } from "vscode-languageserver";
import type { DocumentStore } from "../document-store";
import type { Languages } from "../languages";
import type { SymbolIndex } from "../symbol-index";
import type { Trees } from "../trees";
import type { SourceFile } from "../type";
import { lspRange, parallel } from "../util";
import { TriggeredSymbolKind, type TriggeredSymbolInfo } from "./common";

export class DefinitionProvider {
  constructor(
    private readonly _languages: Languages,
    private readonly _documents: DocumentStore,
    private readonly _trees: Trees,
    private readonly _symbols: SymbolIndex,
  ) {}

  async provideDefinition(params: DefinitionParams): Promise<Location[] | undefined> {
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
    const info = this._getInfo(tree.resolve(pos, -1)) ?? this._getInfo(tree.resolve(pos, 1));
    if (!info) {
      return;
    }

    await this._symbols.update();
    const sourceFile = this._symbols.index.get(uri);
    if (!sourceFile) {
      return;
    }

    const name = document.getText().substring(...info.range);
    return await this._provideDefinition(uri, sourceFile, info.kind, name);
  }

  private _getInfo(node: SyntaxNodeRef): TriggeredSymbolInfo | undefined {
    if (node.type.is("UsedClassName")) {
      return { kind: TriggeredSymbolKind.ClassName, range: [node.from, node.to] };
    }
    if (node.type.is("UsedIdName")) {
      return { kind: TriggeredSymbolKind.IdName, range: [node.from, node.to] };
    }
  }

  private async _provideDefinition(
    uri: DocumentUri,
    sourceFile: SourceFile,
    kind: TriggeredSymbolKind,
    name: string,
  ): Promise<Location[]> {
    let prop: "class_names" | "id_names";
    switch (kind) {
      case TriggeredSymbolKind.ClassName:
        prop = "class_names";
        break;
      case TriggeredSymbolKind.IdName:
        prop = "id_names";
        break;
    }

    const tasks: ((token?: CancellationToken) => Promise<Location[]>)[] = [];

    const task = this._createTask(uri, sourceFile, prop, name);
    if (task) {
      tasks.push(task);
    }

    for (const _uri of sourceFile.refs) {
      const _sourceFile = this._symbols.index.get(_uri);
      if (!_sourceFile) {
        continue;
      }

      const task = this._createTask(_uri, _sourceFile, prop, name);
      if (task) {
        tasks.push(task);
      }
    }

    const result = await parallel(tasks, 32);
    return result.flat();
  }

  private _createTask(uri: DocumentUri, sourceFile: SourceFile, prop: "class_names" | "id_names", name: string) {
    const ranges = sourceFile[prop].get(name);
    if (!ranges) {
      return;
    }

    return async () => {
      const document = await this._documents.retrieve(uri);
      // range[0] - 1, add the pos of '#' or '.'
      return ranges.map((range) => Location.create(uri, lspRange(document, [range[0] - 1, range[1]])));
    };
  }
}
