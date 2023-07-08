import fetch, { Headers } from "node-fetch";
import {
  CancellationToken,
  CancellationTokenSource,
  Disposable,
  FilePermission,
  FileStat,
  FileType,
  ProgressLocation,
  Uri,
  l10n,
  window,
} from "vscode";
import { LocalCache } from "./local-cache";

const retryTimeoutInHours = 3 * 24;

export class RequestService implements Disposable {
  private _map: Map<string, [CancellationTokenSource, Promise<Uint8Array>]>;
  private _localCache: LocalCache | undefined;

  constructor(localCache: LocalCache | undefined) {
    this._map = new Map();
    this._localCache = localCache;
  }

  async readFile(uri: Uri, token?: CancellationToken) {
    const uriString = uri.toString(true);

    let content: Uint8Array | undefined;
    if (this._localCache) {
      content = await this._localCache.getIfUpdatedSince(uriString, retryTimeoutInHours);
    }

    if (!content) {
      try {
        let source: CancellationTokenSource;
        let buf: Promise<Uint8Array>;

        const cache = this._map.get(uriString);
        if (cache) {
          [source, buf] = cache;
        } else {
          source = new CancellationTokenSource();
          buf = this.request(uriString, this._localCache?.getETag(uriString), source.token);
          this._map.set(uriString, [source, buf]);
        }
        this.link(token, source);
        content = await buf;
      } finally {
        this._map.delete(uriString);
      }
    }

    return content;
  }

  async stat(uri: Uri, token?: CancellationToken) {
    const uriString = uri.toString(true);
    let stats: FileStat | undefined;
    if (this._localCache) {
      stats = await this._localCache.getStatIfUpdatedSince(uriString, retryTimeoutInHours);
    }

    if (!stats) {
      try {
        let source: CancellationTokenSource;
        let buf: Promise<Uint8Array>;

        const cache = this._map.get(uriString);
        if (cache) {
          [source, buf] = cache;
        } else {
          source = new CancellationTokenSource();
          buf = this.request(uriString, this._localCache?.getETag(uriString), source.token);
          this._map.set(uriString, [source, buf]);
        }
        this.link(token, source);
        const content = await buf;

        stats = {
          ctime: Date.now(),
          mtime: Date.now(),
          size: content.length,
          type: FileType.File,
          permissions: FilePermission.Readonly,
        };
      } finally {
        this._map.delete(uriString);
      }
    }

    return stats;
  }

  dispose() {
    for (const [token, _] of this._map.values()) {
      token.cancel();
    }
    this._map.clear();
  }

  private async request(uri: string, etag?: string, token?: CancellationToken): Promise<Uint8Array> {
    try {
      return await window.withProgress(
        { location: ProgressLocation.Notification, cancellable: true, title: `Download ${uri}` },
        async (_progress, token) => {
          const headers = new Headers();
          if (etag) {
            headers.set("If-None-Match", etag);
          }

          const res = await fetch(uri, { method: "GET", headers, signal: toSignal(token) as any });
          if (res.ok) {
            const content = new Uint8Array(await res.arrayBuffer());
            if (this._localCache) {
              const etag = res.headers.get("etag");
              if (typeof etag === "string") {
                await this._localCache.put(uri, etag, content);
              }
            }
            return content;
          } else if (res.status === 304 && etag && this._localCache) {
            const content = await this._localCache.get(uri, etag, true);
            if (content) {
              return content;
            } else {
              return await this.request(uri, undefined, token);
            }
          } else {
            throw new Error(`Error: ${res.statusText}`);
          }
        }
      );
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        window.showInformationMessage(l10n.t("Download canceled."));
      } else {
        window.showErrorMessage(l10n.t("Download {0} failure! {1}", uri, e instanceof Error ? e.message : ""));
      }
      throw e;
    }
  }

  private link(token: CancellationToken | undefined, source: CancellationTokenSource) {
    if (!token) {
      return;
    }

    if (token.isCancellationRequested) {
      source.cancel();
    }
    token.onCancellationRequested(() => {
      source.cancel();
    });
  }
}

function toSignal(token?: CancellationToken): AbortSignal | undefined {
  if (!token) {
    return;
  }

  const controller = new AbortController();

  if (token.isCancellationRequested) {
    controller.abort();
  } else {
    token.onCancellationRequested(() => {
      controller.abort();
    });
  }

  return controller.signal;
}
