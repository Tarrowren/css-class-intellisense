import { readFile } from "fs/promises";
import fetch, { Headers } from "node-fetch";
import { format } from "util";
import { createConnection, Disposable, ResponseError } from "vscode-languageserver/node";
import { formatError, noop, RuntimeEnvironment } from "../runner";
import { onLanguageServerInitialize, startServer } from "../server";
import { getRemoteFileCache, RemoteFileCache } from "./remote-file-cache";

let cache: RemoteFileCache | null | undefined;

const retryTimeoutInHours = 7 * 24; // 7 days

const connection = createConnection();

console.log = (message?: any, ...optionalParams: any[]) => {
  connection.console.log(format(message, ...optionalParams));
};
console.error = (message?: any, ...optionalParams: any[]) => {
  connection.console.error(format(message, ...optionalParams));
};

process.on("unhandledRejection", (e: any) => {
  console.error(formatError(`Unhandled exception`, e));
});

const runtime: RuntimeEnvironment = {
  file: {
    getContent(uri) {
      const controller = new AbortController();

      return {
        isLocal: true,
        content: readFile(uri.fsPath, { encoding: "utf8", signal: controller.signal }),
        dispose() {
          controller.abort();
        },
      };
    },
  },
  http: {
    getContent(uri) {
      const url = uri.toString();
      if (cache) {
        const content = cache.getIfUpdatedSince(url, retryTimeoutInHours);
        if (content) {
          return { isLocal: true, content: content, dispose: noop };
        }
      }

      const controller = new AbortController();
      return {
        isLocal: false,
        content: request(url, cache?.getETag(url), controller.signal),
        dispose() {
          controller.abort();
        },
      };
    },
  },
  timer: {
    setImmediate: (callback, ...args) => {
      const handle = setImmediate(callback, ...args);
      return Disposable.create(() => clearImmediate(handle));
    },
    setTimeout: (callback, ms, ...args) => {
      const handle = setTimeout(callback, ms, ...args);
      return Disposable.create(() => clearTimeout(handle));
    },
    setInterval(callback, ms, ...args) {
      const handle = setInterval(callback, ms, ...args);
      return Disposable.create(() => clearInterval(handle));
    },
  },
};

const onInitialize: onLanguageServerInitialize = async (options) => {
  if (!options || !options.globalStoragePath || typeof options.globalStoragePath !== "string") {
    throw new ResponseError(1, 'The "globalStoragePath" field is required');
  }

  cache = await getRemoteFileCache(options.globalStoragePath);

  return async () => {
    if (cache) {
      await cache.close();
      cache = null;
    }
  };
};

startServer(connection, runtime, onInitialize);

async function request(uri: string, etag: string | undefined, signal: AbortSignal): Promise<string> {
  const headers = new Headers();
  headers.set("Accept-Encoding", "gzip, deflate");
  if (etag) {
    headers.set("If-None-Match", etag);
  }

  const res = await fetch(uri, {
    headers,
    follow: 5,
    signal: signal as any,
  });

  if (res.ok) {
    const text = await res.text();

    if (cache) {
      const etag = res.headers.get("etag");
      if (typeof etag === "string") {
        await cache.put(uri, etag, text);
      }
    }

    return text;
  }

  if (res.status === 304 && etag && cache) {
    const content = cache.get(uri, etag, true);
    return content ? content : await request(uri, undefined, signal);
  }

  const statusText = res.statusText;
  const text = await res.text();
  throw new Error(text ? `${statusText}: ${text}` : statusText);
}
