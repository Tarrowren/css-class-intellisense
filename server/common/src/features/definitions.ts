import type { SyntaxNodeRef } from "@lezer/common";
import { Location, type CancellationToken, type DefinitionParams, type DocumentUri } from "vscode-languageserver";
import type { Configuration } from "../configuration";
import type { DocumentStore } from "../document-store";
import type { Languages } from "../languages";
import type { SymbolIndex } from "../symbol-index";
import type { Trees } from "../trees";
import type { SourceFile, SymbolInfo } from "../type";
import { lspRange, lspRange2, parallel, textRange } from "../util";
import { TriggeredSymbolKind, type TriggeredSymbolInfo } from "./common";
import { URI } from "vscode-uri";

export class DefinitionProvider {
  constructor(
    private readonly _configuration: Configuration,
    private readonly _languages: Languages,
    private readonly _documents: DocumentStore,
    private readonly _trees: Trees,
    private readonly _symbols: SymbolIndex,
  ) {}

  async provideDefinition(params: DefinitionParams, token: CancellationToken): Promise<Location[] | undefined> {
    const uri = URI.parse(params.textDocument.uri).toString(true);
    const document = this._documents.get(uri);
    if (!document) {
      return;
    }

    const language = this._languages.getLanguage(document.languageId);
    if (!language) {
      return;
    }

    const tree = await this._trees.getParseTree(document, language);
    if (token.isCancellationRequested) {
      return;
    }
    const pos = document.offsetAt(params.position);
    const info = this._getInfo(tree.resolve(pos, -1)) ?? this._getInfo(tree.resolve(pos, 1));
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

    const info = sourceFile[prop].get(name);
    if (info) {
      tasks.push(this._createTask(uri, sourceFile, info));
    }

    for (const _uri of sourceFile.refs.keys()) {
      const _sourceFile = this._symbols.index.get(_uri);
      if (!_sourceFile) {
        continue;
      }

      const _info = _sourceFile[prop].get(name);
      if (_info) {
        tasks.push(this._createTask(_uri, _sourceFile, _info));
      }
    }

    const result = await parallel(tasks, this._configuration.parallel);
    return result.flat();
  }

  private _createTask(
    uri: DocumentUri,
    { suffixes }: SourceFile,
    { ranges, suffix_ranges }: SymbolInfo,
  ): () => Promise<Location[]> {
    return async () => {
      const document = await this._documents.retrieve(uri);

      const result: Location[] = [];
      for (const range of ranges) {
        // range.from - 1, add the pos of '#' or '.'
        result.push(Location.create(uri, lspRange2(document, range)));
      }

      if (suffix_ranges) {
        for (const from of suffix_ranges) {
          const info = suffixes.get(from);
          if (info) {
            result.push(Location.create(uri, lspRange(document, { from, to: info.to })));
          }
        }
      }

      return result;
    };
  }

  private _getInfo(node: SyntaxNodeRef): TriggeredSymbolInfo | undefined {
    if (node.type.is("UsedClassName")) {
      return { kind: TriggeredSymbolKind.ClassName, range: textRange(node) };
    }
    if (node.type.is("UsedIdName")) {
      return { kind: TriggeredSymbolKind.IdName, range: textRange(node) };
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
