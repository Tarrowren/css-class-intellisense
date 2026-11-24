import type { SyntaxNodeRef } from "@lezer/common";
import { Location, type CancellationToken, type DefinitionParams, type DocumentUri } from "vscode-languageserver";
import type { DocumentStore } from "../document-store";
import { os } from "../env";
import type { Languages } from "../languages";
import { Semaphore } from "../semaphore";
import type { SymbolIndex } from "../symbol-index";
import type { Trees } from "../trees";
import type { SourceFile, SymbolInfo } from "../type";
import { lspRange, lspRange2, normalize, textRange } from "../util";
import { TriggeredSymbolKind, type TriggeredSymbolInfo } from "./common";

export class DefinitionProvider {
  private readonly _semaphore = new Semaphore(os().concurrency);

  constructor(
    private readonly _languages: Languages,
    private readonly _documents: DocumentStore,
    private readonly _trees: Trees,
    private readonly _symbols: SymbolIndex,
  ) {}

  async provideDefinition(params: DefinitionParams, token: CancellationToken): Promise<Location[] | undefined> {
    const uri = normalize(params.textDocument.uri);
    const document = this._documents.get(uri);
    if (!document) {
      return;
    }

    const language = this._languages.get(document.languageId);
    if (!language) {
      return;
    }

    const tree = await this._trees.get(document, language, token);
    const pos = document.offsetAt(params.position);
    const info = this._getInfo(tree.resolve(pos, -1)) ?? this._getInfo(tree.resolve(pos, 1));
    if (!info) {
      return;
    }

    await this._symbols.update(token);

    const sourceFile = this._symbols.index.get(uri);
    if (!sourceFile) {
      return;
    }

    const name = document.getText().substring(info.range.from, info.range.to);
    return await this._getDefinitions(uri, sourceFile, info.kind, name, token);
  }

  private async _getDefinitions(
    documentUri: DocumentUri,
    sourceFile: SourceFile,
    kind: TriggeredSymbolKind,
    name: string,
    token: CancellationToken,
  ): Promise<Location[]> {
    const prop = this._getProp(kind);
    const locations: Promise<Location[]>[] = [];

    const info = sourceFile[prop].get(name);
    if (info) {
      locations.push(this._semaphore.lock(this._getLocations(documentUri, sourceFile, info, token), token));
    }

    for (const uri of sourceFile.refs.keys()) {
      const defSourceFile = this._symbols.index.get(uri);
      if (!defSourceFile) {
        continue;
      }

      const defInfo = defSourceFile[prop].get(name);
      if (defInfo) {
        locations.push(this._semaphore.lock(this._getLocations(uri, defSourceFile, defInfo, token), token));
      }
    }

    const result = await Promise.all(locations);
    return result.flat();
  }

  private _getLocations(
    uri: DocumentUri,
    { suffixes }: SourceFile,
    { ranges, suffix_ranges }: SymbolInfo,
    token: CancellationToken,
  ): () => Promise<Location[]> {
    return async () => {
      const document = await this._documents.retrieve(uri, token);

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
