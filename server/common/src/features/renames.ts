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
import type { Languages } from "../languages";
import type { SymbolIndex } from "../symbol-index";
import type { Trees } from "../trees";
import { SymbolRange, type SourceFile } from "../type";
import { lspRange, parallel } from "../util";
import { TriggeredSymbolKind, type TriggeredSymbolInfo } from "./common";

export class RenameProvider {
  constructor(
    private readonly _languages: Languages,
    private readonly _documents: DocumentStore,
    private readonly _trees: Trees,
    private readonly _symbols: SymbolIndex,
  ) {}

  async prepareRename(params: PrepareRenameParams): Promise<Range | { defaultBehavior: boolean }> {
    const range = await this._prepareRename(params.textDocument.uri, params.position);
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

  async provideRenameEdits(params: RenameParams): Promise<WorkspaceEdit | undefined> {
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
    const sourceFile = this._symbols.index.get(uri);
    if (!sourceFile) {
      return;
    }

    if (info.kind === "suffix") {
      const suffixes = sourceFile.suffixes.get(info.range.from);
      if (!suffixes) {
        return;
      }

      const suffixLen = info.range.to - info.range.from;
      const newText = params.newName;

      const tasks: ((token?: CancellationToken) => Promise<[DocumentUri, TextEdit[]]>)[] = [];
      for (const [_uri, _sourceFile] of this._symbols.index) {
        if (_sourceFile.refs.has(uri) || sourceFile.refs.has(_uri) || uri === _uri) {
          const ranges: [SymbolRange, string?][] = [];
          const duplicateSuffixes = new Set<number>();

          for (const symbol of suffixes) {
            const [defProp, refProp] = this._getProp(symbol.kind);
            const defRanges = _sourceFile[defProp].get(symbol.name);
            const refRanges = _sourceFile[refProp].get(symbol.name);

            if (defRanges) {
              for (const range of defRanges) {
                // remove duplicate suffixes range
                if (range.suffix && !duplicateSuffixes.has(range.from)) {
                  duplicateSuffixes.add(range.from);
                  ranges.push([range]);
                }
              }
            }

            if (refRanges) {
              const fullNewText = symbol.name.slice(0, -suffixLen) + newText;
              for (const range of refRanges) {
                ranges.push([range, fullNewText]);
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

      const result = await parallel(tasks, 32);
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
          for (const range of defRanges) {
            if (!range.suffix) {
              ranges.push(range);
            }
          }
        }

        if (refRanges) {
          ranges.push(...refRanges);
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

    const result = await parallel(tasks, 32);
    return Object.fromEntries(result);
  }

  private _getInfo(node: SyntaxNodeRef): TriggeredSymbolInfo | { kind: "suffix"; range: SymbolRange } | undefined {
    if (node.type.is("ClassName") || node.type.is("UsedClassName")) {
      return { kind: TriggeredSymbolKind.ClassName, range: SymbolRange.fromNode(node) };
    }
    if (node.type.is("IdName") || node.type.is("UsedIdName")) {
      return { kind: TriggeredSymbolKind.IdName, range: SymbolRange.fromNode(node) };
    }
    if (node.type.is("Suffix")) {
      return { kind: "suffix", range: SymbolRange.fromNode(node, true) };
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
