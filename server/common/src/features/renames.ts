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
import { URI } from "vscode-uri";
import type { Configuration } from "../configuration";
import type { DocumentStore } from "../document-store";
import type { Languages } from "../languages";
import type { SymbolIndex } from "../symbol-index";
import type { Trees } from "../trees";
import type { SourceFile, SymbolRange } from "../type";
import { lspRange, parallel, textRange } from "../util";
import { TriggeredSymbolKind, type TriggeredSymbolInfo } from "./common";

export class RenameProvider {
  constructor(
    private readonly _configuration: Configuration,
    private readonly _languages: Languages,
    private readonly _documents: DocumentStore,
    private readonly _trees: Trees,
    private readonly _symbols: SymbolIndex,
  ) {}

  async prepareRename(params: PrepareRenameParams): Promise<Range | { defaultBehavior: boolean }> {
    const uri = URI.parse(params.textDocument.uri).toString(true);
    const range = await this._prepareRename(uri, params.position);
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

    const info =
      this._getInfo(tree.resolve(pos, -1)) ??
      this._getInfo(tree.resolve(pos, 1)) ??
      this._getInfo(tree.resolve(pos + 1, 1));
    if (!info) {
      return;
    }

    return lspRange(document, info.range);
  }

  async provideRenameEdits(params: RenameParams, token: CancellationToken): Promise<WorkspaceEdit | undefined> {
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
      const newText = params.newName;

      const tasks: ((token?: CancellationToken) => Promise<[DocumentUri, TextEdit[]]>)[] = [];
      for (const [_uri, _sourceFile] of this._symbols.index) {
        if (_sourceFile.refs.has(uri) || sourceFile.refs.has(_uri) || uri === _uri) {
          const ranges: [SymbolRange, string?][] = [];
          const duplicates = new Set<number>();

          for (const [name, kinds] of suffix.full_names) {
            if (kinds & TriggeredSymbolKind.ClassName) {
              const [defProp, refProp] = this._getProp(TriggeredSymbolKind.ClassName);
              const defRanges = _sourceFile[defProp].get(name);
              const refRanges = _sourceFile[refProp].get(name);

              if (defRanges) {
                for (const from of defRanges.suffix_ranges) {
                  if (duplicates.has(from)) {
                    continue;
                  }
                  duplicates.add(from);

                  const _suffixInfo = _sourceFile.suffixes.get(from);
                  if (_suffixInfo) {
                    ranges.push([{ from, to: _suffixInfo.to }]);
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
              const [defProp, refProp] = this._getProp(TriggeredSymbolKind.IdName);
              const defRanges = _sourceFile[defProp].get(name);
              const refRanges = _sourceFile[refProp].get(name);

              if (defRanges) {
                for (const from of defRanges.suffix_ranges) {
                  if (duplicates.has(from)) {
                    continue;
                  }
                  duplicates.add(from);

                  const _suffixInfo = _sourceFile.suffixes.get(from);
                  if (_suffixInfo) {
                    ranges.push([{ from, to: _suffixInfo.to }]);
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
            tasks.push(async () => {
              const document = await this._documents.retrieve(_uri);
              const edits = ranges.map<TextEdit>(([range, text]) => ({
                range: lspRange(document, range),
                newText: text ?? newText,
              }));
              return [_uri, edits];
            });
          }
        }
      }

      const result = await parallel(tasks, this._configuration.parallel);
      const changes = Object.fromEntries(result);
      return { changes };
    } else {
      const name = document.getText().substring(info.range.from, info.range.to);
      const changes = await this._provideRenameEdits(uri, sourceFile, info.kind, name, params.newName);
      return { changes };
    }
  }

  private async _provideRenameEdits(
    uri: DocumentUri,
    sourceFile: SourceFile,
    kind: TriggeredSymbolKind,
    name: string,
    newText: string,
  ): Promise<Record<DocumentUri, TextEdit[]>> {
    const [defProp, refProp] = this._getProp(kind);

    const tasks: ((token?: CancellationToken) => Promise<[DocumentUri, TextEdit[]]>)[] = [];
    for (const [_uri, _sourceFile] of this._symbols.index) {
      if (_sourceFile.refs.has(uri) || sourceFile.refs.has(_uri) || uri === _uri) {
        const defRanges = _sourceFile[defProp].get(name);
        const refRanges = _sourceFile[refProp].get(name);

        const ranges: SymbolRange[] = [];
        if (defRanges) {
          ranges.push(...defRanges.ranges);
        }

        if (refRanges) {
          ranges.push(...refRanges.ranges);
        }

        if (ranges.length > 0) {
          tasks.push(async () => {
            const document = await this._documents.retrieve(_uri);
            const edits = ranges.map<TextEdit>((range) => ({ range: lspRange(document, range), newText }));
            return [_uri, edits];
          });
        }
      }
    }

    const result = await parallel(tasks, this._configuration.parallel);
    return Object.fromEntries(result);
  }

  private _getInfo(node: SyntaxNodeRef): TriggeredSymbolInfo | { kind: "suffix"; range: SymbolRange } | undefined {
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

  private _getProp(kind: TriggeredSymbolKind): ["class_names", "used_class_names"] | ["id_names", "used_id_names"] {
    switch (kind) {
      case TriggeredSymbolKind.ClassName:
        return ["class_names", "used_class_names"];
      case TriggeredSymbolKind.IdName:
        return ["id_names", "used_id_names"];
    }
  }
}
