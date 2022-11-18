import { CancellationTokenSource, Disposable, workspace } from "vscode";
import { LanguageModelCache } from "./caches/cache";
import { LanguageCacheEntry } from "./caches/language-caches";
import { formatError, outputChannel } from "./runner";

export function createReferenceMap(cache: LanguageModelCache<LanguageCacheEntry>): ReferenceMap {
  const source = new CancellationTokenSource();
  let data: Map<string, Set<string>> | null = null;

  (async () => {
    try {
      const map = new Map<string, Set<string>>();
      const uris = await workspace.findFiles("**/*.html", undefined, undefined, source.token);
      if (uris.length > 0) {
        await Promise.all(
          uris.map(async (uri) => {
            const document = await workspace.openTextDocument(uri);
            const hrefs = cache.get(document).hrefs;
            if (hrefs && hrefs.size > 0) {
              const ref = uri.toString(true);
              for (const href of hrefs) {
                let refs = map.get(href);
                if (refs) {
                  refs.add(ref);
                } else {
                  map.set(href, new Set([ref]));
                }
              }
            }
          })
        );
      }
      data = map;
    } catch (e) {
      data = new Map();
      outputChannel.appendLine(formatError("ReferenceMap", e));
    }
  })();

  return {
    get data() {
      return data;
    },
    dispose() {
      source.cancel();
      if (data) {
        data.clear();
      }
    },
  };
}

export interface ReferenceMap extends Disposable {
  readonly data: Map<string, Set<string>> | null;
}
