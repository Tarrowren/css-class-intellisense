import type { SyntaxNodeRef } from "@lezer/common";
import { DocumentUri, Range, type CancellationToken, type Disposable } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { URI, Utils } from "vscode-uri";
import type { SymbolRange } from "./type";

export async function parallel<T>(
  tasks: ((token?: CancellationToken) => Promise<T>)[],
  degree: number,
  token?: CancellationToken,
): Promise<T[]> {
  const result: T[] = [];
  let start = 0;
  const len = tasks.length;
  for (;;) {
    if (token?.isCancellationRequested) {
      throw new Error("cancelled");
    }

    if (start >= len) {
      break;
    }

    const end = start + degree;
    const partTasks = tasks.slice(start, end);
    const partResult = await Promise.all(partTasks.map((task) => task(token)));
    result.push(...partResult);

    start = end;

    await scheduler.yield();
  }
  return result;
}

export class Queue<T> implements Disposable {
  private readonly _queue = new Set<T>();

  enqueue(uri: T): void {
    if (!this._queue.has(uri)) {
      this._queue.add(uri);
    }
  }

  dequeue(uri: T): void {
    this._queue.delete(uri);
  }

  consume(n: number | undefined, filter: (uri: T) => boolean): T[] {
    if (n === undefined) {
      n = this._queue.size;
    }
    const result: T[] = [];
    for (const uri of this._queue) {
      if (!filter(uri)) {
        continue;
      }
      this._queue.delete(uri);
      if (result.push(uri) >= n) {
        break;
      }
    }
    return result;
  }

  dispose(): void {
    this._queue.clear();
  }
}

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

  logger.warn("can't resolve uri  " + ref);
  return null;
}
