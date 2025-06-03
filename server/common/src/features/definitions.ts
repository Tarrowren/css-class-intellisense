import type { SyntaxNodeRef } from "@lezer/common";
import { Location, type CancellationToken, type DefinitionParams, type DocumentUri } from "vscode-languageserver";
import type { DocumentStore } from "../document-store";
import type { Languages } from "../languages";
import type { SymbolIndex } from "../symbol-index";
import type { Trees } from "../trees";
import { SymbolRange, type SourceFile } from "../type";
import { lspRange, lspRange2, parallel } from "../util";
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

    const name = document.getText().substring(info.range.from, info.range.to);
    return await this._provideDefinition(uri, sourceFile, info.kind, name);
  }

  private async _provideDefinition(
    uri: DocumentUri,
    sourceFile: SourceFile,
    kind: TriggeredSymbolKind,
    name: string,
  ): Promise<Location[]> {
    const prop = this._getProp(kind);
    const tasks: ((token?: CancellationToken) => Promise<Location[]>)[] = [];

    const ranges = sourceFile[prop].get(name);
    if (ranges) {
      tasks.push(this._createTask(uri, ranges));
    }

    for (const _uri of sourceFile.refs) {
      const _sourceFile = this._symbols.index.get(_uri);
      if (!_sourceFile) {
        continue;
      }

      const ranges = _sourceFile[prop].get(name);
      if (ranges) {
        tasks.push(this._createTask(_uri, ranges));
      }
    }

    const result = await parallel(tasks, 32);
    return result.flat();
  }

  private _createTask(uri: DocumentUri, ranges: SymbolRange[]) {
    return async () => {
      const document = await this._documents.retrieve(uri);

      return ranges.map((range) =>
        Location.create(
          uri,
          // range.from - 1, add the pos of '#' or '.'
          range.suffix ? lspRange(document, range) : lspRange2(document, range),
        ),
      );
    };
  }

  private _getInfo(node: SyntaxNodeRef): TriggeredSymbolInfo | undefined {
    if (node.type.is("UsedClassName")) {
      return { kind: TriggeredSymbolKind.ClassName, range: SymbolRange.fromNode(node) };
    }
    if (node.type.is("UsedIdName")) {
      return { kind: TriggeredSymbolKind.IdName, range: SymbolRange.fromNode(node) };
    }
  }

  private _getProp(kind: TriggeredSymbolKind): "class_names" | "id_names" {
    switch (kind) {
      case TriggeredSymbolKind.ClassName:
        return "class_names";
      case TriggeredSymbolKind.IdName:
        return "id_names";
    }
  }
}
