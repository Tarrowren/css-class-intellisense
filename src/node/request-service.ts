import { Headers, XHRResponse, getErrorStatusDescription, xhr } from "request-light";
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

class RequestCache<K, V> implements Disposable {
  private _cache = new Map<K, [CancellationTokenSource, Promise<V>]>();

  constructor(private _func: (key: K, token?: CancellationToken) => Promise<V>) {}

  async get(key: K, token?: CancellationToken): Promise<V> {
    let source: CancellationTokenSource | undefined;
    let promise: Promise<V> | undefined;

    try {
      const value = this._cache.get(key);

      if (value) {
        [source, promise] = value;
      } else {
        source = new CancellationTokenSource();
        promise = this._func(key, token);

        this._cache.set(key, [source, promise]);
      }

      linkCancellationToken(token, source);

      return await promise;
    } finally {
      this._cache.delete(key);
      source?.dispose();
    }
  }

  dispose(): void {
    for (const [source, _] of this._cache.values()) {
      source.cancel();
    }

    this._cache.clear();
  }
}

export class RequestService implements Disposable {
  private _retryTimeoutInHours = 3 * 24;
  private _requestCache = new RequestCache<string, Uint8Array>((uri, token) => {
    return this._requestWithProgress(uri, this._localCache.getETag(uri), token);
  });

  constructor(private _localCache: LocalCache) {}

  async readFile(uri: Uri, token?: CancellationToken): Promise<Uint8Array> {
    const uriString = uri.toString(true);

    let content: Uint8Array | undefined;
    if (this._localCache) {
      content = await this._localCache.getIfUpdatedSince(uriString, this._retryTimeoutInHours);
    }

    if (!content) {
      content = await this._requestCache.get(uriString, token);
    }

    return content;
  }

  async stat(uri: Uri, token?: CancellationToken): Promise<FileStat> {
    const uriString = uri.toString(true);

    let stat: FileStat | undefined;
    if (this._localCache) {
      stat = await this._localCache.getStatIfUpdatedSince(uriString, this._retryTimeoutInHours);
    }

    if (!stat) {
      const content = await this._requestCache.get(uriString, token);
      stat = {
        ctime: Date.now(),
        mtime: Date.now(),
        size: content.length,
        type: FileType.File,
        permissions: FilePermission.Readonly,
      };
    }

    return stat;
  }

  dispose() {
    this._requestCache.dispose();
  }

  private _isXHRResponse(err: unknown): err is XHRResponse {
    if (err && typeof err === "object" && "status" in err) {
      return typeof err.status === "number";
    } else {
      return false;
    }
  }

  private async _requestWithProgress(
    uri: string,
    etag: string | undefined,
    token?: CancellationToken,
  ): Promise<Uint8Array> {
    try {
      return await window.withProgress(
        { location: ProgressLocation.Notification, cancellable: true, title: l10n.t("Start downloading {0}.", uri) },
        async (_progress, token2) => {
          const source = new CancellationTokenSource();

          linkCancellationToken(token, source);
          linkCancellationToken(token2, source);

          try {
            return this._request(uri, etag, source.token);
          } finally {
            source.dispose();
          }
        },
      );
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        window.showInformationMessage(l10n.t("Download canceled."));
      } else {
        window.showErrorMessage(l10n.t("Failed to download {0}!\n{1}", uri, err instanceof Error ? err.message : ""));
      }
      throw err;
    }
  }

  private async _request(uri: string, etag: string | undefined, token: CancellationToken): Promise<Uint8Array> {
    const headers: Headers = { "Accept-Encoding": "gzip, deflate" };
    if (etag) {
      headers["If-None-Match"] = etag;
    }

    try {
      const res = await xhr({ url: uri, followRedirects: 5, headers, token });
      if (this._localCache) {
        const etag = res.headers["etag"];
        if (typeof etag === "string") {
          await this._localCache.put(uri, etag, res.body);
        }
      }
      return res.body;
    } catch (err) {
      if (this._isXHRResponse(err)) {
        if (err.status === 304 && etag && this._localCache) {
          const content = await this._localCache.get(uri, etag, true);
          if (content) {
            return content;
          } else {
            return await this._request(uri, undefined, token);
          }
        } else {
          let status = getErrorStatusDescription(err.status);
          if (status && err.responseText) {
            status = `${status}\n${err.responseText.substring(0, 200)}`;
          }
          if (!status) {
            status = err.toString();
          }
          throw new Error(status);
        }
      } else {
        throw err;
      }
    }
  }
}

function linkCancellationToken(token: CancellationToken | undefined, source: CancellationTokenSource) {
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
