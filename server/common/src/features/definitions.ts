import { CancellationToken, Location, type Definition, type DefinitionParams } from "vscode-languageserver";
import type { DocumentStore } from "../document-store";
import type { Languages } from "../languages";
import type { SymbolIndex } from "../symbol-index";
import type { Trees } from "../trees";
import { lspRange, parallel } from "../util";

export class DefinitionProvider {
  constructor(
    private readonly _languages: Languages,
    private readonly _documents: DocumentStore,
    private readonly _trees: Trees,
    private readonly _symbols: SymbolIndex,
  ) {}

  async provideDefinition(params: DefinitionParams): Promise<Definition | undefined> {
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
    const definitionSymbolInfo = language.getDefinitionSymbolInfo(
      document.getText(),
      document.offsetAt(params.position),
      tree,
    );
    if (!definitionSymbolInfo) {
      return;
    }

    await this._symbols.update();

    const { kind, name } = definitionSymbolInfo;

    const definition: Location[] = [];
    switch (kind) {
      case DefinitionSymbolKind.Class:
        this._collect(name, "class_names", definition);
        break;
      case DefinitionSymbolKind.Id:
        this._collect(name, "id_names", definition);
        break;
    }

    return definition;
  }

  private async _collect(name: string, prop: "class_names" | "id_names", tmp: Location[]) {
    const tasks: ((token?: CancellationToken) => Promise<void>)[] = [];
    for (const [uri, sourceFile] of this._symbols.index) {
      tasks.push(async () => {
        const symbolInfo = sourceFile[prop].get(name);
        if (symbolInfo) {
          const document = await this._documents.retrieve(uri);
          for (const range of symbolInfo) {
            // range[0] - 1, add the pos of '#' or '.'
            tmp.push(Location.create(uri, lspRange(document, [range[0] - 1, range[1]])));
          }
        }
      });
    }

    await parallel(tasks, 32);
  }
}

export interface DefinitionSymbolInfo {
  kind: DefinitionSymbolKind;
  name: string;
}

export enum DefinitionSymbolKind {
  Class,
  Id,
}
