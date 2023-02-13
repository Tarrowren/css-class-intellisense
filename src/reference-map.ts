import { Disposable, Uri, workspace } from "vscode";
import { LanguageModelCache } from "./caches/cache";
import { LanguageCacheEntry } from "./caches/language-caches";
import { log, RuntimeEnvironment } from "./runner";

export function createReferenceMap(
  runtime: RuntimeEnvironment,
  cache: LanguageModelCache<LanguageCacheEntry>
): ReferenceMap {
  const map = new Map<string, Set<string>>();
  let isComplete = false;

  const watcher = workspace.createFileSystemWatcher("**/*.{html,vue,jsx,tsx}");

  const disposables = [
    watcher.onDidCreate((uri) => {
      onChange(map, cache, uri);
    }),
    watcher.onDidChange((uri) => {
      onChange(map, cache, uri);
    }),
    watcher.onDidDelete((uri) => {
      onDelete(map, uri);
    }),
  ];

  async function rebuildReference() {
    // https://github.com/microsoft/vscode-test-web/issues/4
    if (runtime.isBrowser) {
      return;
    }
    try {
      const uris = await workspace.findFiles("**/*.{html,vue,jsx,tsx}", "**/node_modules/**");
      if (uris.length > 0) {
        await Promise.all(
          uris.map(async (uri) => {
            try {
              const document = await workspace.openTextDocument(uri);
              const hrefs = cache.get(document).hrefs;
              if (hrefs && hrefs.size > 0) {
                const uriString = uri.toString(true);

                const entry = map.get(uriString);
                if (entry) {
                  for (const href of hrefs) {
                    entry.add(href);
                  }
                } else {
                  map.set(uriString, hrefs);
                }

                for (const href of hrefs) {
                  const entry = map.get(href);
                  if (entry) {
                    entry.add(uriString);
                  } else {
                    map.set(href, new Set([uriString]));
                  }
                }
              }
            } catch (e) {
              log.error(e, "open text document");
            }
          })
        );
      }
    } catch (e) {
      log.error(e, "rebuild reference");
    }
  }

  return {
    async getRefs(uri) {
      const uriString = uri.toString(true);
      if (isComplete) {
        return map.get(uriString);
      }

      await rebuildReference();

      isComplete = true;
      return map.get(uriString);
    },
    dispose() {
      for (const disposable of disposables) {
        disposable.dispose();
      }
      map.clear();
    },
  };
}

export interface ReferenceMap extends Disposable {
  getRefs(uri: Uri): Promise<Set<string> | undefined>;
}

async function onChange(refmap: Map<string, Set<string>>, cache: LanguageModelCache<LanguageCacheEntry>, uri: Uri) {
  const document = await workspace.openTextDocument(uri);
  const newHrefs = cache.get(document).hrefs;

  const uriString = uri.toString(true);
  const oldHrefs = refmap.get(uriString);
  if (oldHrefs && oldHrefs.size > 0) {
    if (newHrefs && newHrefs.size > 0) {
      refmap.set(uriString, newHrefs);

      for (const href of oldHrefs) {
        if (newHrefs.has(href)) {
          continue;
        }
        const uris = refmap.get(href);
        if (uris) {
          uris.delete(uriString);
        }
      }

      for (const href of newHrefs) {
        if (oldHrefs.has(href)) {
          continue;
        }
        const uris = refmap.get(href);
        if (uris) {
          uris.add(uriString);
        } else {
          refmap.set(href, new Set([uriString]));
        }
      }
    } else {
      refmap.delete(uriString);

      for (const href of oldHrefs) {
        const uris = refmap.get(href);
        if (uris) {
          uris.delete(uriString);
        }
      }
    }
  } else {
    if (newHrefs && newHrefs.size > 0) {
      refmap.set(uriString, newHrefs);

      for (const href of newHrefs) {
        const uris = refmap.get(href);
        if (uris) {
          uris.add(uriString);
        } else {
          refmap.set(href, new Set([uriString]));
        }
      }
    }
  }
}

function onDelete(refmap: Map<string, Set<string>>, uri: Uri) {
  const uriString = uri.toString(true);
  const oldHrefs = refmap.get(uriString);
  if (oldHrefs && oldHrefs.size > 0) {
    refmap.delete(uriString);

    for (const href of oldHrefs) {
      const uris = refmap.get(href);
      if (uris) {
        uris.delete(uriString);
      }
    }
  }
}
