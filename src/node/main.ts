import http from "node:http";
import https from "node:https";
import { buffer } from "node:stream/consumers";
import { TextDecoder } from "node:util";
import { CancellationToken, Disposable, ExtensionContext, FilePermission, FileType, Uri } from "vscode";
import { convertToHttpScheme } from "../file-system";
import { RuntimeEnvironment } from "../runner";
import { createLanguageServer, LanguageServer } from "../server";
import { createRequestCache, RequestCache } from "./request-cache";

let server: LanguageServer | null;

const retryTimeoutInHours = 1 * 24;

export async function activate(context: ExtensionContext) {
  let cache: RequestCache | undefined;

  const globalStorage = context.globalStorageUri;
  if (globalStorage.scheme === "file") {
    cache = await createRequestCache(globalStorage.fsPath, context.globalState);
  }

  async function request(uri: Uri, etag?: string, token?: CancellationToken): Promise<Uint8Array> {
    uri = convertToHttpScheme(uri);
    const uriString = uri.toString();

    const signal = toSignal(token);

    const headers: http.OutgoingHttpHeaders = {};
    if (etag) {
      headers["If-None-Match"] = etag;
    }

    const options: http.RequestOptions = {
      headers,
      host: uri.authority,
      path: uri.path,
      method: "GET",
      timeout: 10000,
      signal,
    };

    const res = await new Promise<http.IncomingMessage>((c, e) => {
      let req = uri.scheme === "http" ? http.request(options, c) : https.request(options, c);
      req.on("error", e);
      req.end();
    });
    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
      const content = await buffer(res);
      if (cache) {
        const etag = res.headers.etag;
        if (typeof etag === "string") {
          await cache.put(uriString, etag, content);
        }
      }
      return content;
    } else if (res.statusCode === 304 && etag && cache) {
      const content = await cache.get(uriString, etag, true);
      if (content) {
        return content;
      } else {
        return await request(uri, undefined, token);
      }
    } else {
      throw new Error(`Error: ${res.statusMessage}`);
    }
  }

  const runtime: RuntimeEnvironment = {
    request: {
      async readFile(uri, token) {
        const uriString = uri.toString();
        if (cache) {
          const content = await cache.getFileIfUpdatedSince(uriString, retryTimeoutInHours);
          if (content) {
            return content;
          }
        }
        return await request(uri, cache?.getETag(uriString), token);
      },
      async stat(uri, token) {
        const uriString = uri.toString();
        if (cache) {
          const fileStat = cache.getFileStatIfUpdatedSince(uriString, retryTimeoutInHours);
          if (fileStat) {
            return fileStat;
          }
        }
        const content = await request(uri, cache?.getETag(uriString), token);
        return { ctime: 0, mtime: 0, size: content.length, type: FileType.File, permissions: FilePermission.Readonly };
      },
    },
    timer: {
      setImmediate(callback, ...args) {
        const handle = setImmediate(callback, ...args);
        return new Disposable(() => clearImmediate(handle));
      },
      setInterval(callback, ms, ...args) {
        const handle = setTimeout(callback, ms, ...args);
        return new Disposable(() => clearTimeout(handle));
      },
      setTimeout(callback, ms, ...args) {
        const handle = setInterval(callback, ms, ...args);
        return new Disposable(() => clearInterval(handle));
      },
    },
    util: {
      decode(input, encoding) {
        return new TextDecoder(encoding).decode(input);
      },
    },
  };

  server = createLanguageServer(context, runtime);
}

export function deactivate() {
  if (server) {
    server = null;
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
