import { CancellationTokenSource, Disposable, Uri, workspace } from "vscode";
import { LanguageModelCache } from "./caches/cache";
import { LanguageCacheEntry } from "./caches/language-caches";
import { formatError, outputChannel, RuntimeEnvironment } from "./runner";

export async function createReferenceMap(
  runtime: RuntimeEnvironment,
  cache: LanguageModelCache<LanguageCacheEntry>
): Promise<ReferenceMap> {
  const refmap = new Map<string, Set<string>>();

  const source = new CancellationTokenSource();
  const timeout = runtime.timer.setTimeout(() => {
    source.cancel();
  }, 5000);

  try {
    const uris = await workspace.findFiles("**/*.{html,vue}", "**/node_modules/**", undefined, source.token);
    if (uris.length > 0) {
      await Promise.all(
        uris.map(async (uri) => {
          const document = await workspace.openTextDocument(uri);
          const hrefs = cache.get(document).hrefs;
          if (hrefs && hrefs.size > 0) {
            const uriString = uri.toString(true);

            refmap.set(uriString, hrefs);

            for (const href of hrefs) {
              const uris = refmap.get(href);
              if (uris) {
                uris.add(uriString);
              } else {
                refmap.set(href, new Set([uriString]));
              }
            }
          }
        })
      );
    }
  } catch (e) {
    outputChannel.appendLine(formatError("ReferenceMap", e));
  } finally {
    timeout.dispose();
    source.dispose();
  }

  const watcher = workspace.createFileSystemWatcher("**/*.{html,vue}");
  const disposables = [
    watcher.onDidCreate((uri) => {
      onChange(uri, cache, refmap);
    }),
    watcher.onDidChange((uri) => {
      onChange(uri, cache, refmap);
    }),
    watcher.onDidDelete((uri) => {
      onDelete(uri, refmap);
    }),
  ];

  return {
    get map() {
      return refmap;
    },
    dispose() {
      watcher.dispose();
      for (const disposable of disposables) {
        disposable.dispose();
      }

      refmap.clear();
    },
  };
}

export interface ReferenceMap extends Disposable {
  readonly map: Map<string, Set<string>>;
}

async function onChange(uri: Uri, cache: LanguageModelCache<LanguageCacheEntry>, map: Map<string, Set<string>>) {
  const document = await workspace.openTextDocument(uri);
  const newHrefs = cache.get(document).hrefs;

  const uriString = uri.toString(true);
  const oldHrefs = map.get(uriString);
  if (oldHrefs && oldHrefs.size > 0) {
    if (newHrefs && newHrefs.size > 0) {
      map.set(uriString, newHrefs);

      for (const href of oldHrefs) {
        if (newHrefs.has(href)) {
          continue;
        }
        const uris = map.get(href);
        if (uris) {
          uris.delete(uriString);
        }
      }

      for (const href of newHrefs) {
        if (oldHrefs.has(href)) {
          continue;
        }
        const uris = map.get(href);
        if (uris) {
          uris.add(uriString);
        } else {
          map.set(href, new Set([uriString]));
        }
      }
    } else {
      map.delete(uriString);

      for (const href of oldHrefs) {
        const uris = map.get(href);
        if (uris) {
          uris.delete(uriString);
        }
      }
    }
  } else {
    if (newHrefs && newHrefs.size > 0) {
      map.set(uriString, newHrefs);

      for (const href of newHrefs) {
        const uris = map.get(href);
        if (uris) {
          uris.add(uriString);
        } else {
          map.set(href, new Set([uriString]));
        }
      }
    }
  }
}

function onDelete(uri: Uri, map: Map<string, Set<string>>) {
  const uriString = uri.toString(true);
  const oldHrefs = map.get(uriString);
  if (oldHrefs && oldHrefs.size > 0) {
    map.delete(uriString);

    for (const href of oldHrefs) {
      const uris = map.get(href);
      if (uris) {
        uris.delete(uriString);
      }
    }
  }
}
