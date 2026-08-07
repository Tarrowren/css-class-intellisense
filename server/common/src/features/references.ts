import type { SyntaxNode } from "@lezer/common";
import { Location, type CancellationToken, type DocumentUri, type ReferenceParams } from "vscode-languageserver";
import type { DocumentStore } from "../document-store";
import { os } from "../env";
import type { Languages } from "../languages";
import type { SymbolIndex } from "../symbol-index";
import type { Trees } from "../trees";
import type { SymbolInfo } from "../type";
import { lspRange, normalize, parallel, textRange } from "../util";
import { TriggeredSymbolKind, type TriggeredSymbolInfo } from "./common";

export class ReferenceProvider {
  constructor(
    private readonly _languages: Languages,
    private readonly _documents: DocumentStore,
    private readonly _trees: Trees,
    private readonly _symbols: SymbolIndex,
  ) {}

  async provideReferences(params: ReferenceParams, token: CancellationToken): Promise<Location[] | undefined> {
    const uri = normalize(params.textDocument.uri);
    const maybeExpired = this._documents.get(uri);
    if (!maybeExpired) {
      return;
    }

    const language = this._languages.getLanguage(maybeExpired.languageId);
    if (!language) {
      return;
    }

    const { document, tree } = await this._trees.getParseTree(maybeExpired, language);
    if (token.isCancellationRequested) {
      return;
    }
    const pos = document.offsetAt(params.position);
    const info =
      this._getInfo(tree.resolve(pos, -1)) ??
      this._getInfo(tree.resolve(pos, 1)) ??
      this._getInfo(tree.resolve(pos + 1, 1));
    if (!info) {
      return;
    }

    await this._symbols.update();
    if (token.isCancellationRequested) {
      return;
    }

    if (info.kind === "suffix") {
      const sourceFile = this._symbols.index.get(uri);
      if (!sourceFile) {
        return;
      }

      const suffix = sourceFile.suffixes.get(info.from);
      if (!suffix) {
        return;
      }

      const tasks: ((token?: CancellationToken) => Promise<Location[]>)[] = [];
      for (const [_uri, _sourceFile] of this._symbols.index) {
        if (_sourceFile.refs.has(uri) || uri === _uri) {
          for (const [name, kinds] of suffix.full_names) {
            if (kinds & TriggeredSymbolKind.ClassName) {
              const prop = this._getProp(TriggeredSymbolKind.ClassName);

              const info = _sourceFile[prop].get(name);
              if (info) {
                tasks.push(this._createTask(_uri, info));
              }
            }

            if (kinds & TriggeredSymbolKind.IdName) {
              const prop = this._getProp(TriggeredSymbolKind.IdName);

              const info = _sourceFile[prop].get(name);
              if (info) {
                tasks.push(this._createTask(_uri, info));
              }
            }
          }
        }
      }

      const result = await parallel(tasks, os().concurrency);
      return result.flat();
    } else {
      return await this._provideReferences(
        uri,
        info.kind,
        document.getText().substring(info.range.from, info.range.to),
      );
    }
  }

  private async _provideReferences(uri: DocumentUri, kind: TriggeredSymbolKind, name: string): Promise<Location[]> {
    const prop = this._getProp(kind);
    const tasks: ((token?: CancellationToken) => Promise<Location[]>)[] = [];
    for (const [_uri, _sourceFile] of this._symbols.index) {
      if (_sourceFile.refs.has(uri) || uri === _uri) {
        const info = _sourceFile[prop].get(name);
        if (info) {
          tasks.push(this._createTask(_uri, info));
        }
      }
    }

    const result = await parallel(tasks, os().concurrency);
    return result.flat();
  }

  private _createTask(uri: DocumentUri, info: SymbolInfo): (token?: CancellationToken) => Promise<Location[]> {
    return async () => {
      const document = await this._documents.retrieve(uri);
      return info.ranges.map((range) => Location.create(uri, lspRange(document, range)));
    };
  }

  private _getInfo(node: SyntaxNode): TriggeredSymbolInfo | { kind: "suffix"; from: number } | undefined {
    if (node.type.is("ClassName")) {
      return { kind: TriggeredSymbolKind.ClassName, range: textRange(node) };
    }
    if (node.type.is("IdName")) {
      return { kind: TriggeredSymbolKind.IdName, range: textRange(node) };
    }
    if (node.type.is("Suffix")) {
      return { kind: "suffix", from: node.from };
    }
  }

  private _getProp(kind: TriggeredSymbolKind): "used_class_names" | "used_id_names" {
    switch (kind) {
      case TriggeredSymbolKind.ClassName:
        return "used_class_names";
      case TriggeredSymbolKind.IdName:
        return "used_id_names";
    }
  }
}
