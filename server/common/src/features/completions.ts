import * as l10n from "@vscode/l10n";
import {
  CancellationToken,
  CompletionItemKind,
  Range,
  type CompletionItem,
  type CompletionList,
  type CompletionParams,
  type DocumentUri,
} from "vscode-languageserver";
import { URI } from "vscode-uri";
import type { DocumentStore } from "../document-store";
import type { Languages } from "../languages";
import type { SymbolIndex } from "../symbol-index";
import type { Trees } from "../trees";
import type { SourceFile, SymbolInfo, SymbolRange } from "../type";
import { lspRange, normalize } from "../util";
import { CompletionTriggeredSymbolKind } from "./common";

export class CompletionItemProvider {
  constructor(
    private readonly _languages: Languages,
    private readonly _documents: DocumentStore,
    private readonly _trees: Trees,
    private readonly _symbols: SymbolIndex,
  ) {}

  async provideCompletionItems(
    params: CompletionParams,
    token: CancellationToken,
  ): Promise<CompletionList | undefined> {
    const uri = normalize(params.textDocument.uri);
    const document = this._documents.get(uri);
    if (!document) {
      return;
    }

    const language = this._languages.get(document.languageId);
    if (!language || !language.completion) {
      return;
    }

    const tree = await this._trees.get(document, language, token);
    const info = language.completion(document.getText(), document.offsetAt(params.position), tree);
    if (!info) {
      return;
    }

    await this._symbols.update(token);

    const sourceFile = this._symbols.index.get(uri);
    if (!sourceFile) {
      return;
    }

    let items: Map<string, CompletionItem>;
    switch (info.kind) {
      case CompletionTriggeredSymbolKind.ClassName:
        items = this._collectDefinition(uri, sourceFile, "class_names");
        break;
      case CompletionTriggeredSymbolKind.IdName:
        items = this._collectDefinition(uri, sourceFile, "id_names");
        break;
      case CompletionTriggeredSymbolKind.Css:
        items = this._collectReference(uri);
        break;
    }

    if (items.size === 0) {
      return;
    }

    let editRange: Range | undefined;
    if (info.editRange) {
      editRange = lspRange(document, info.editRange);
    }

    return { isIncomplete: false, itemDefaults: { editRange }, items: [...items.values()] };
  }

  async provideCompletionResolve(params: CompletionItem, token: CancellationToken): Promise<CompletionItem> {
    const data = params.data as CompletionData;
    if (!data || data.length === 0) {
      return params;
    }

    const detail = data.length === 1 ? _getLabel(data[0].uri) : l10n.t("{0} files", data.length);

    const files = await Promise.all(
      data.map(async ({ uri, ranges }) => {
        const doc = await this._documents.retrieve(uri, token);
        if (!doc) {
          return null;
        }

        const r = /\.((?:c|sc|sa|le)ss)$/.exec(uri);
        const lang = r ? r[1] : "css";

        return (
          `### ${_getLabel(uri)}\n\n` +
          ranges
            .map(
              (v) =>
                "```" + lang + "\n" + doc.getText(Range.create(doc.positionAt(v.from), doc.positionAt(v.to))) + "\n```",
            )
            .join("\n\n---\n\n")
        );
      }),
    );

    const documentation = files.filter((v) => !!v).join("\n\n");

    params.detail = detail;
    params.documentation = {
      kind: "markdown",
      value: documentation,
    };

    return params;
  }

  private _collectDefinition(
    uri: DocumentUri,
    sourceFile: SourceFile,
    prop: "class_names" | "id_names",
  ): Map<string, CompletionItem> {
    const result = new Map<string, _CompletionItem>();

    for (const [name, symbolInfo] of sourceFile[prop]) {
      const d = _getDocRanges(uri, sourceFile, symbolInfo);
      if (result.has(name)) {
        result.get(name)!.data.push(d);
      } else {
        result.set(name, {
          label: name,
          kind: CompletionItemKind.Variable,
          data: [d],
        });
      }
    }

    for (const defUri of sourceFile.refs.keys()) {
      const defSourceFile = this._symbols.index.get(defUri);
      if (!defSourceFile) {
        continue;
      }

      for (const [name, symbolInfo] of defSourceFile[prop]) {
        const d = _getDocRanges(defUri, defSourceFile, symbolInfo);
        if (result.has(name)) {
          result.get(name)!.data.push(d);
        } else {
          result.set(name, {
            label: name,
            kind: CompletionItemKind.Variable,
            data: [d],
          });
        }
      }
    }

    return result;
  }

  private _collectReference(uri: DocumentUri): Map<string, CompletionItem> {
    const result = new Map<string, CompletionItem>();

    for (const [refUri, refSourceFile] of this._symbols.index) {
      if (refSourceFile.refs.has(uri) || uri === refUri) {
        for (const name of refSourceFile.used_class_names.keys()) {
          result.set(name, {
            label: "." + name,
            kind: CompletionItemKind.Variable,
          });
        }
        for (const name of refSourceFile.used_id_names.keys()) {
          result.set(name, {
            label: "#" + name,
            kind: CompletionItemKind.Variable,
          });
        }
      }
    }

    return result;
  }
}

function _getLabel(uri: DocumentUri): string {
  const u = URI.parse(uri);
  if (u.scheme === "file") {
    return u.fsPath;
  } else {
    return uri;
  }
}

function _getDocRanges(uri: DocumentUri, sourceFile: SourceFile, symbolInfo: SymbolInfo): DocRanges {
  const ranges = [
    ...symbolInfo.doc_ranges,
    ...symbolInfo.suffix_ranges
      .map<SymbolRange | undefined>((from) => sourceFile.suffixes.get(from)?.doc_range)
      .filter<SymbolRange>((v) => !!v),
  ];

  return { uri, ranges };
}

interface DocRanges {
  readonly uri: string;
  readonly ranges: SymbolRange[];
}

interface CompletionData extends ReadonlyArray<DocRanges> {}

interface _CompletionItem extends CompletionItem {
  readonly data: DocRanges[];
}
