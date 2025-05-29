import type { SyntaxNodeRef } from "@lezer/common";
import { Location, type CancellationToken, type DocumentUri, type ReferenceParams } from "vscode-languageserver";
import type { DocumentStore } from "../document-store";
import type { Languages } from "../languages";
import type { SymbolIndex } from "../symbol-index";
import type { Trees } from "../trees";
import { lspRange, parallel } from "../util";
import { TriggeredSymbolKind, type TriggeredSymbolInfo } from "./common";

export class ReferenceProvider {
  constructor(
    private readonly _languages: Languages,
    private readonly _documents: DocumentStore,
    private readonly _trees: Trees,
    private readonly _symbols: SymbolIndex,
  ) {}

  async provideReferences(params: ReferenceParams): Promise<Location[] | undefined> {
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

    return await this._provideReferences(uri, info.kind, document.getText().substring(...info.range));
  }

  private _getInfo(node: SyntaxNodeRef): TriggeredSymbolInfo | undefined {
    if (node.type.is("ClassName")) {
      return { kind: TriggeredSymbolKind.ClassName, range: [node.from, node.to] };
    }
    if (node.type.is("IdName")) {
      return { kind: TriggeredSymbolKind.IdName, range: [node.from, node.to] };
    }
  }

  private async _provideReferences(uri: DocumentUri, kind: TriggeredSymbolKind, name: string): Promise<Location[]> {
    let prop: "used_class_names" | "used_id_names";
    switch (kind) {
      case TriggeredSymbolKind.ClassName:
        prop = "used_class_names";
        break;
      case TriggeredSymbolKind.IdName:
        prop = "used_id_names";
        break;
    }

    const tasks: ((token?: CancellationToken) => Promise<Location[]>)[] = [];
    for (const [_uri, _sourceFile] of this._symbols.index) {
      if (_sourceFile.refs.has(uri) || uri === _uri) {
        const ranges = _sourceFile[prop].get(name);

        if (ranges) {
          tasks.push(async () => {
            const document = await this._documents.retrieve(_uri);
            return ranges.map((range) => Location.create(_uri, lspRange(document, range)));
          });
        }
      }
    }

    const result = await parallel(tasks, 32);
    return result.flat();
  }
}
