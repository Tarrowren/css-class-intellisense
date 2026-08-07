import type { SyntaxNodeRef } from "@lezer/common";
import { DocumentUri, Range } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { URI, Utils } from "vscode-uri";
import type { SymbolRange } from "./type";

export function textRange(node: SyntaxNodeRef): SymbolRange {
  return { from: node.from, to: node.to };
}

export function lspRange(document: TextDocument, range: SymbolRange): Range {
  return Range.create(document.positionAt(range.from), document.positionAt(range.to));
}

/**
 * including `#` or `.` prefix
 * @param document
 * @param range
 * @returns
 */
export function lspRange2(document: TextDocument, range: SymbolRange): Range {
  return Range.create(document.positionAt(range.from - 1), document.positionAt(range.to));
}

export function resolve(base: DocumentUri, ref: string): DocumentUri | null {
  if (ref.startsWith(".")) {
    return Utils.resolvePath(Utils.dirname(URI.parse(base)), ref).toString(true);
  }

  const uri = URI.parse(ref);
  if (uri.scheme === "http" || uri.scheme === "https") {
    return uri.toString(true);
  }

  console.warn("can't resolve uri  " + ref);
  return null;
}

export function normalize(uri: string): string {
  return URI.parse(uri).toString(true);
}
