import { CancellationTokenSource, Disposable, Uri, workspace } from "vscode";
import { LanguageModelCache } from "./caches/cache";
import { LanguageCacheEntry } from "./caches/language-caches";
import { formatError, outputChannel } from "./runner";

export function createReferenceMap(cache: LanguageModelCache<LanguageCacheEntry>): ReferenceMap {
  async function onChange(uri: Uri) {
    if (!_map) {
      return;
    }

    const document = await workspace.openTextDocument(uri);
    const newHrefs = cache.get(document).hrefs;

    const uriString = uri.toString(true);
    const oldHrefs = _map.get(uriString);
    if (oldHrefs && oldHrefs.size > 0) {
      if (newHrefs && newHrefs.size > 0) {
        _map.set(uriString, newHrefs);

        for (const href of oldHrefs) {
          if (newHrefs.has(href)) {
            continue;
          }
          const uris = _map.get(href);
          if (uris) {
            uris.delete(uriString);
          }
        }

        for (const href of newHrefs) {
          if (oldHrefs.has(href)) {
            continue;
          }
          const uris = _map.get(href);
          if (uris) {
            uris.add(uriString);
          } else {
            _map.set(href, new Set([uriString]));
          }
        }
      } else {
        _map.delete(uriString);

        for (const href of oldHrefs) {
          const uris = _map.get(href);
          if (uris) {
            uris.delete(uriString);
          }
        }
      }
    } else {
      if (newHrefs && newHrefs.size > 0) {
        _map.set(uriString, newHrefs);

        for (const href of newHrefs) {
          const uris = _map.get(href);
          if (uris) {
            uris.add(uriString);
          } else {
            _map.set(href, new Set([uriString]));
          }
        }
      }
    }
  }

  function onDelete(uri: Uri) {
    if (!_map) {
      return;
    }

    const uriString = uri.toString(true);
    const oldHrefs = _map.get(uriString);
    if (oldHrefs && oldHrefs.size > 0) {
      _map.delete(uriString);

      for (const href of oldHrefs) {
        const uris = _map.get(href);
        if (uris) {
          uris.delete(uriString);
        }
      }
    }
  }

  const watcher = workspace.createFileSystemWatcher("**/*.{html,vue}");
  const disposables = [watcher.onDidCreate(onChange), watcher.onDidChange(onChange), watcher.onDidDelete(onDelete)];

  const source = new CancellationTokenSource();
  let _map: Map<string, Set<string>> | null = null;

  (async () => {
    try {
      const map = new Map<string, Set<string>>();

      const uris = await workspace.findFiles("**/*.{html,vue}", "**/node_modules/**", undefined, source.token);
      if (uris.length > 0) {
        await Promise.all(
          uris.map(async (uri) => {
            const document = await workspace.openTextDocument(uri);
            const hrefs = cache.get(document).hrefs;
            if (hrefs && hrefs.size > 0) {
              const uriString = uri.toString(true);

              map.set(uriString, hrefs);

              for (const href of hrefs) {
                const uris = map.get(href);
                if (uris) {
                  uris.add(uriString);
                } else {
                  map.set(href, new Set([uriString]));
                }
              }
            }
          })
        );
      }

      _map = map;
    } catch (e) {
      _map = new Map();
      outputChannel.appendLine(formatError("ReferenceMap", e));
    }
  })();

  return {
    get map() {
      return _map;
    },
    dispose() {
      watcher.dispose();
      for (const disposable of disposables) {
        disposable.dispose();
      }

      source.cancel();
      if (_map) {
        _map.clear();
      }
    },
  };
}

export interface ReferenceMap extends Disposable {
  readonly map: Map<string, Set<string>> | null;
}
