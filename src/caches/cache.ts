import { Disposable, TextDocument } from "vscode";
import { RuntimeEnvironment } from "../runner";

interface Info<T> {
  version: number;
  languageId: string;
  cTime: number;
  data: T;
}

export interface LanguageModelCache<T> extends Disposable {
  get(document: TextDocument): T;
  onDocumentRemoved(document: TextDocument): void;
}

export class GlobalLanguageModelCache<T> implements LanguageModelCache<T> {
  private cache = new Map<string, Info<T>>();
  private disposable: Disposable | null | undefined;

  constructor(
    runtime: RuntimeEnvironment,
    private maxEntries: number,
    cleanupIntervalTimeInSec: number,
    private parse: (document: TextDocument) => T
  ) {
    if (cleanupIntervalTimeInSec > 0) {
      const ms = cleanupIntervalTimeInSec * 1000;

      this.disposable = runtime.timer.setInterval(() => {
        const cutoffTime = Date.now() - ms;
        for (const [k, v] of this.cache) {
          if (v.cTime < cutoffTime) {
            this.cache.delete(k);
          }
        }
      }, ms);
    }
  }

  get(document: TextDocument): T {
    const { version, languageId } = document;

    const uri = document.uri.toString(true);

    const info = this.cache.get(uri);
    if (info && info.version === version && info.languageId === languageId) {
      info.cTime = Date.now();
      return info.data;
    }

    const data = this.parse(document);
    this.cache.set(uri, { version, languageId, cTime: Date.now(), data });

    if (this.cache.size >= this.maxEntries) {
      let oldestUri: string | undefined;
      let oldestTime = Number.MAX_VALUE;

      for (const [k, v] of this.cache) {
        if (v.cTime < oldestTime) {
          oldestUri = k;
          oldestTime = v.cTime;
        }
      }

      if (oldestUri) {
        this.cache.delete(oldestUri);
      }
    }

    return data;
  }

  onDocumentRemoved(document: TextDocument): void {
    this.cache.delete(document.uri.toString(true));
  }

  dispose() {
    if (this.disposable) {
      this.disposable.dispose();
      this.disposable = null;
    }

    this.cache.clear();
  }
}
