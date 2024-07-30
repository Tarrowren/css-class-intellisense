import { CancellationTokenSource, Disposable, FileSystemWatcher, TextDocument, Uri, workspace } from "vscode";
import { LanguageModelCache } from "./caches/cache";
import { LanguageCacheEntry } from "./caches/language-caches";
import { Configuration } from "./config";
import { CssConfig } from "./css-config";
import { RuntimeEnvironment, logError, logger } from "./runner";

export interface ReferenceMap extends Disposable {
  getRefs(uri: Uri): Promise<Set<string> | undefined>;
}

class _ReferenceMap implements ReferenceMap {
  private graph = new Map<string, Set<string>>();
  private watcher: FileSystemWatcher;
  private disposables: Disposable[];
  private promise: Promise<void> | null | undefined;
  private readonly globPattern: string = "**/*.{html,vue,jsx,tsx,php}";
  private source = new CancellationTokenSource();

  constructor(
    private runtime: RuntimeEnvironment,
    private cache: LanguageModelCache<LanguageCacheEntry>,
    private cssConfig: CssConfig,
  ) {
    this.watcher = workspace.createFileSystemWatcher(this.globPattern);
    this.disposables = [
      this.watcher.onDidCreate(this.onDidChange, this),
      this.watcher.onDidChange(this.onDidChange, this),
      this.watcher.onDidDelete(this.onDidDelete, this),
    ];
    this.promise = this.rebuildReference();
  }

  async getRefs(uri: Uri): Promise<Set<string> | undefined> {
    if (this.promise) {
      await this.promise;
    }

    const uriString = uri.toString(true);
    return this.graph.get(uriString);
  }

  dispose() {
    this.source.cancel();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.watcher.dispose();
    this.graph.clear();
  }

  private async rebuildReference() {
    try {
      // https://github.com/microsoft/vscode-test-web/issues/4
      if (this.runtime.isBrowser) {
        return;
      }

      const uris = await workspace.findFiles(this.globPattern, "**/node_modules/**", undefined, this.source.token);
      if (uris.length === 0) {
        return;
      }

      logger.info("Starting load reference map");
      const start = this.runtime.timer.timestamp();

      for (const uri of uris) {
        if (this.source.token.isCancellationRequested) {
          break;
        }

        try {
          const document = await workspace.openTextDocument(uri);

          const hrefs = await this.getHrefs(document);
          if (hrefs.size === 0) {
            continue;
          }

          const uriString = uri.toString(true);

          const entry = this.graph.get(uriString);
          if (entry) {
            for (const href of hrefs) {
              entry.add(href);
            }
          } else {
            this.graph.set(uriString, hrefs);
          }

          for (const href of hrefs) {
            const entry = this.graph.get(href);
            if (entry) {
              entry.add(uriString);
            } else {
              this.graph.set(href, new Set([uriString]));
            }
          }
        } catch (e) {
          logError(e, "rebuild reference");
        }
      }

      const elapsed = this.runtime.timer.timestamp() - start;
      logger.info("Finishing load reference map: ", elapsed);
    } catch (e) {
      logError(e, "rebuild reference");
    } finally {
      this.promise = null;
    }
  }

  private async onDidChange(uri: Uri) {
    const document = await workspace.openTextDocument(uri);
    const newHrefs = await this.getHrefs(document);

    const uriString = uri.toString(true);

    const oldHrefs = this.graph.get(uriString);
    if (oldHrefs && oldHrefs.size > 0) {
      if (newHrefs.size > 0) {
        this.graph.set(uriString, newHrefs);

        for (const href of oldHrefs) {
          if (newHrefs.has(href)) {
            continue;
          }
          const uris = this.graph.get(href);
          if (uris) {
            uris.delete(uriString);
          }
        }

        for (const href of newHrefs) {
          if (oldHrefs.has(href)) {
            continue;
          }
          const uris = this.graph.get(href);
          if (uris) {
            uris.add(uriString);
          } else {
            this.graph.set(href, new Set([uriString]));
          }
        }
      } else {
        this.graph.delete(uriString);

        for (const href of oldHrefs) {
          const uris = this.graph.get(href);
          if (uris) {
            uris.delete(uriString);
          }
        }
      }
    } else {
      if (newHrefs.size > 0) {
        this.graph.set(uriString, newHrefs);

        for (const href of newHrefs) {
          const uris = this.graph.get(href);
          if (uris) {
            uris.add(uriString);
          } else {
            this.graph.set(href, new Set([uriString]));
          }
        }
      }
    }
  }

  private onDidDelete(uri: Uri) {
    const uriString = uri.toString(true);

    const oldHrefs = this.graph.get(uriString);
    if (oldHrefs && oldHrefs.size > 0) {
      this.graph.delete(uriString);

      for (const href of oldHrefs) {
        const uris = this.graph.get(href);
        if (uris) {
          uris.delete(uriString);
        }
      }
    }
  }

  private async getHrefs(document: TextDocument) {
    const hrefs = this.cache.get(document).hrefs;
    const globalCssFiles = await this.cssConfig.getGlobalCssFiles(document.uri);
    return new Set([...hrefs, ...globalCssFiles]);
  }
}

export class GlobalReferenceMap implements ReferenceMap {
  private map: ReferenceMap | null | undefined;
  private disposable: Disposable;

  constructor(
    runtime: RuntimeEnvironment,
    config: Configuration,
    cache: LanguageModelCache<LanguageCacheEntry>,
    cssConfig: CssConfig,
  ) {
    if (!config.lightweight) {
      this.map = new _ReferenceMap(runtime, cache, cssConfig);
    }

    this.disposable = config.on.lightweight((lightweight) => {
      if (lightweight) {
        if (this.map) {
          this.map.dispose();
          this.map = null;
        }
      } else {
        this.map = new _ReferenceMap(runtime, cache, cssConfig);
      }
    });
  }

  async getRefs(uri: Uri): Promise<Set<string> | undefined> {
    return await this.map?.getRefs(uri);
  }

  dispose() {
    if (this.map) {
      this.map.dispose();
      this.map = null;
    }

    this.disposable.dispose();
  }
}
