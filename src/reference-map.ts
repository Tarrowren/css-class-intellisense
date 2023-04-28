import { Disposable, FileSystemWatcher, Uri, workspace } from "vscode";
import { LanguageModelCache } from "./caches/cache";
import { LanguageCacheEntry } from "./caches/language-caches";
import { Configuration } from "./config";
import { RuntimeEnvironment, log } from "./runner";

export interface ReferenceMap extends Disposable {
  getRefs(uri: Uri): Promise<Set<string> | undefined>;
}

class _ReferenceMap implements ReferenceMap {
  private graph = new Map<string, Set<string>>();
  private watcher: FileSystemWatcher;
  private disposables: Disposable[];
  private promise: Promise<void> | null | undefined;
  private readonly globPattern: string = "**/*.{html,vue,jsx,tsx,php}";

  constructor(private runtime: RuntimeEnvironment, private cache: LanguageModelCache<LanguageCacheEntry>) {
    this.watcher = workspace.createFileSystemWatcher(this.globPattern);
    this.disposables = [
      this.watcher.onDidCreate(this.onDidChange, this),
      this.watcher.onDidChange(this.onDidChange, this),
      this.watcher.onDidDelete(this.onDidDelete, this),
    ];
    this.promise = this.rebuildReference();
  }

  async getRefs(uri: Uri): Promise<Set<string> | undefined> {
    const uriString = uri.toString(true);
    if (!this.promise) {
      return this.graph.get(uriString);
    }

    await this.promise;

    return this.graph.get(uriString);
  }

  dispose() {
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

      const uris = await workspace.findFiles(this.globPattern, "**/node_modules/**");
      if (uris.length === 0) {
        return;
      }

      await Promise.all(
        uris.map(async (uri) => {
          try {
            const document = await workspace.openTextDocument(uri);

            const hrefs = this.cache.get(document).hrefs;
            if (hrefs.size === 0) {
              return;
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
            log.error(e, "rebuild reference");
          }
        })
      );
    } catch (e) {
      log.error(e, "rebuild reference");
    } finally {
      this.promise = null;
    }
  }

  private async onDidChange(uri: Uri) {
    const document = await workspace.openTextDocument(uri);
    const newHrefs = this.cache.get(document).hrefs;

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
}

export class GlobalReferenceMap implements ReferenceMap {
  private map: ReferenceMap | null | undefined;
  private disposable: Disposable;

  constructor(
    private runtime: RuntimeEnvironment,
    private config: Configuration,
    private cache: LanguageModelCache<LanguageCacheEntry>
  ) {
    if (!this.config.lightweight) {
      this.map = new _ReferenceMap(this.runtime, this.cache);
    }

    this.disposable = this.config.on.lightweight((lightweight) => {
      if (lightweight) {
        if (this.map) {
          this.map.dispose();
          this.map = null;
        }
      } else {
        this.map = new _ReferenceMap(this.runtime, this.cache);
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
