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
import { os } from "../env";
import type { Languages } from "../languages";
import { Semaphore } from "../semaphore";
import type { SymbolIndex } from "../symbol-index";
import type { Trees } from "../trees";
import type { SourceFile, SuffixInfo, SymbolRange } from "../type";
import { lspRange, normalize, textRange } from "../util";
import { TriggeredSymbolKind, type TriggeredSymbolInfo } from "./common";

export class RenameProvider {
  private readonly _semaphore = new Semaphore(os().concurrency);

  constructor(
    private readonly _languages: Languages,
    private readonly _documents: DocumentStore,
    private readonly _trees: Trees,
    private readonly _symbols: SymbolIndex,
  ) {}

  async prepareRename(
    params: PrepareRenameParams,
    token: CancellationToken,
  ): Promise<Range | { defaultBehavior: boolean }> {
    const uri = normalize(params.textDocument.uri);
    const range = await this._prepare_rename(uri, params.position, token);
    return range ?? { defaultBehavior: true };
  }

  private async _prepare_rename(
    uri: DocumentUri,
    position: Position,
    token: CancellationToken,
  ): Promise<Range | undefined> {
    const maybeExpired = this._documents.get(uri);
    if (!maybeExpired) {
      return;
    }

    const language = this._languages.getLanguage(maybeExpired.languageId);
    if (!language) {
      return;
    }

    const { document, tree } = await this._trees.getParseTree(maybeExpired, language, token);
    const pos = document.offsetAt(position);

    const info =
      this._get_info(tree.resolve(pos, -1)) ??
      this._get_info(tree.resolve(pos, 1)) ??
      this._get_info(tree.resolve(pos + 1, 1));
    if (!info) {
      return;
    }

    return lspRange(document, info.range);
  }

  async provideRenameEdits(params: RenameParams, token: CancellationToken): Promise<WorkspaceEdit | undefined> {
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

    const sourceFile = this._symbols.index.get(uri);
    if (!sourceFile) {
      return;
    }

    if (info.kind === "suffix") {
      const suffix = sourceFile.suffixes.get(info.range.from);
      if (!suffix) {
        return;
      }

      const suffixLen = info.range.to - info.range.from;
      const changes = await this._provide_suffix_rename_edits(
        uri,
        sourceFile,
        suffix,
        suffixLen,
        params.newName,
        token,
      );
      return { changes };
    } else {
      const name = document.getText().substring(info.range.from, info.range.to);
      const changes = await this._provide_rename_edits(uri, sourceFile, info.kind, name, params.newName, token);
      return { changes };
    }
  }

  private async _provide_suffix_rename_edits(
    documentUri: DocumentUri,
    sourceFile: SourceFile,
    suffix: SuffixInfo,
    suffixLen: number,
    newText: string,
    token: CancellationToken,
  ) {
    const values: Promise<[DocumentUri, TextEdit[]]>[] = [];
    for (const [uri, defOrRefSourceFile] of this._symbols.index) {
      if (defOrRefSourceFile.refs.has(documentUri) || sourceFile.refs.has(uri) || documentUri === uri) {
        const ranges: [SymbolRange, string?][] = [];
        const duplicates = new Set<number>();

        for (const [name, kinds] of suffix.full_names) {
          if (kinds & TriggeredSymbolKind.ClassName) {
            const [defProp, refProp] = this._get_prop(TriggeredSymbolKind.ClassName);
            const defRanges = defOrRefSourceFile[defProp].get(name);
            const refRanges = defOrRefSourceFile[refProp].get(name);

            if (defRanges) {
              for (const from of defRanges.suffix_ranges) {
                if (duplicates.has(from)) {
                  continue;
                }
                duplicates.add(from);

                const defSuffix = defOrRefSourceFile.suffixes.get(from);
                if (defSuffix) {
                  ranges.push([{ from, to: defSuffix.to }]);
                }
              }
            }

            if (refRanges) {
              const fullNewText = name.slice(0, -suffixLen) + newText;
              for (const range of refRanges.ranges) {
                ranges.push([range, fullNewText]);
              }
            }
          }

          if (kinds & TriggeredSymbolKind.IdName) {
            const [defProp, refProp] = this._get_prop(TriggeredSymbolKind.IdName);
            const defRanges = defOrRefSourceFile[defProp].get(name);
            const refRanges = defOrRefSourceFile[refProp].get(name);

            if (defRanges) {
              for (const from of defRanges.suffix_ranges) {
                if (duplicates.has(from)) {
                  continue;
                }
                duplicates.add(from);

                const defSuffix = defOrRefSourceFile.suffixes.get(from);
                if (defSuffix) {
                  ranges.push([{ from, to: defSuffix.to }]);
                }
              }
            }

            if (refRanges) {
              const fullNewText = name.slice(0, -suffixLen) + newText;
              for (const range of refRanges.ranges) {
                ranges.push([range, fullNewText]);
              }
            }
          }
        }

        if (ranges.length > 0) {
          values.push(
            this._semaphore.lock(async () => {
              const document = await this._documents.retrieve(uri, token);
              const edits = ranges.map<TextEdit>(([range, text]) => ({
                range: lspRange(document, range),
                newText: text ?? newText,
              }));
              return [uri, edits];
            }, token),
          );
        }
      }
    }

    const result = await Promise.all(values);
    return Object.fromEntries(result);
  }

  private async _provide_rename_edits(
    documentUri: DocumentUri,
    sourceFile: SourceFile,
    kind: TriggeredSymbolKind,
    name: string,
    newText: string,
    token: CancellationToken,
  ): Promise<Record<DocumentUri, TextEdit[]>> {
    const [defProp, refProp] = this._get_prop(kind);

    const values: Promise<[DocumentUri, TextEdit[]]>[] = [];
    for (const [uri, defOrRefSourceFile] of this._symbols.index) {
      if (defOrRefSourceFile.refs.has(documentUri) || sourceFile.refs.has(uri) || documentUri === uri) {
        const defRanges = defOrRefSourceFile[defProp].get(name);
        const refRanges = defOrRefSourceFile[refProp].get(name);

        const ranges: SymbolRange[] = [];
        if (defRanges) {
          ranges.push(...defRanges.ranges);
        }

        if (refRanges) {
          ranges.push(...refRanges.ranges);
        }

        if (ranges.length > 0) {
          values.push(
            this._semaphore.lock(async () => {
              const document = await this._documents.retrieve(uri, token);
              const edits = ranges.map<TextEdit>((range) => ({ range: lspRange(document, range), newText }));
              return [uri, edits];
            }, token),
          );
        }
      }
    }

    const result = await Promise.all(values);
    return Object.fromEntries(result);
  }

  private _get_info(node: SyntaxNodeRef): TriggeredSymbolInfo | { kind: "suffix"; range: SymbolRange } | undefined {
    if (node.type.is("ClassName") || node.type.is("UsedClassName")) {
      return { kind: TriggeredSymbolKind.ClassName, range: textRange(node) };
    }
    if (node.type.is("IdName") || node.type.is("UsedIdName")) {
      return { kind: TriggeredSymbolKind.IdName, range: textRange(node) };
    }
    if (node.type.is("Suffix")) {
      return { kind: "suffix", range: textRange(node) };
    }
  }

  private _get_prop(kind: TriggeredSymbolKind): ["class_names", "used_class_names"] | ["id_names", "used_id_names"] {
    switch (kind) {
      case TriggeredSymbolKind.ClassName:
        return ["class_names", "used_class_names"];
      case TriggeredSymbolKind.IdName:
        return ["id_names", "used_id_names"];
    }
  }
}
