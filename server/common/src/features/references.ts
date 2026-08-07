import type { SyntaxNode } from "@lezer/common";
import { Location, type CancellationToken, type DocumentUri, type ReferenceParams } from "vscode-languageserver";
import type { DocumentStore } from "../document-store";
import { os } from "../env";
import type { Languages } from "../languages";
import { Semaphore } from "../semaphore";
import type { SymbolIndex } from "../symbol-index";
import type { Trees } from "../trees";
import type { SymbolInfo } from "../type";
import { lspRange, normalize, textRange } from "../util";
import { TriggeredSymbolKind, type TriggeredSymbolInfo } from "./common";

export class ReferenceProvider {
  private readonly _semaphore = new Semaphore(os().concurrency);

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

    const { document, tree } = await this._trees.getParseTree(maybeExpired, language, token);
    const pos = document.offsetAt(params.position);
    const info =
      this._get_info(tree.resolve(pos, -1)) ??
      this._get_info(tree.resolve(pos, 1)) ??
      this._get_info(tree.resolve(pos + 1, 1));
    if (!info) {
      return;
    }

    await this._symbols.update(token);

    if (info.kind === "suffix") {
      return await this._provide_suffix_references(uri, info.from, token);
    } else {
      return await this._provide_references(
        uri,
        info.kind,
        document.getText().substring(info.range.from, info.range.to),
        token,
      );
    }
  }

  private async _provide_suffix_references(documentUri: DocumentUri, from: number, token: CancellationToken) {
    const sourceFile = this._symbols.index.get(documentUri);
    if (!sourceFile) {
      return;
    }

    const suffix = sourceFile.suffixes.get(from);
    if (!suffix) {
      return;
    }

    const values: Promise<Location[]>[] = [];
    for (const [uri, refSourceFile] of this._symbols.index) {
      if (refSourceFile.refs.has(documentUri) || documentUri === uri) {
        for (const [name, kinds] of suffix.full_names) {
          if (kinds & TriggeredSymbolKind.ClassName) {
            const prop = this._get_prop(TriggeredSymbolKind.ClassName);

            const info = refSourceFile[prop].get(name);
            if (info) {
              values.push(this._semaphore.lock(this._create_task(uri, info, token), token));
            }
          }

          if (kinds & TriggeredSymbolKind.IdName) {
            const prop = this._get_prop(TriggeredSymbolKind.IdName);

            const info = refSourceFile[prop].get(name);
            if (info) {
              values.push(this._semaphore.lock(this._create_task(uri, info, token), token));
            }
          }
        }
      }
    }

    const result = await Promise.all(values);
    return result.flat();
  }
  private async _provide_references(
    uri: DocumentUri,
    kind: TriggeredSymbolKind,
    name: string,
    token: CancellationToken,
  ): Promise<Location[]> {
    const prop = this._get_prop(kind);
    const values: Promise<Location[]>[] = [];
    for (const [_uri, refSourceFile] of this._symbols.index) {
      if (refSourceFile.refs.has(uri) || uri === _uri) {
        const info = refSourceFile[prop].get(name);
        if (info) {
          values.push(this._semaphore.lock(this._create_task(_uri, info, token), token));
        }
      }
    }

    const result = await Promise.all(values);
    return result.flat();
  }

  private _create_task(uri: DocumentUri, info: SymbolInfo, token: CancellationToken): () => Promise<Location[]> {
    return async () => {
      const document = await this._documents.retrieve(uri, token);
      return info.ranges.map((range) => Location.create(uri, lspRange(document, range)));
    };
  }

  private _get_info(node: SyntaxNode): TriggeredSymbolInfo | { kind: "suffix"; from: number } | undefined {
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

  private _get_prop(kind: TriggeredSymbolKind): "used_class_names" | "used_id_names" {
    switch (kind) {
      case TriggeredSymbolKind.ClassName:
        return "used_class_names";
      case TriggeredSymbolKind.IdName:
        return "used_id_names";
    }
  }
}
