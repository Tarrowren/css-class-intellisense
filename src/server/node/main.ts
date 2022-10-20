import { readFile } from "fs/promises";
import fetch, { HeadersInit, Response } from "node-fetch";
import { format } from "util";
import { createConnection, Disposable } from "vscode-languageserver/node";
import { formatError, noop, RuntimeEnvironment } from "../runner";
import { onLanguageServerInitialize, startServer } from "../server";
import { getRemoteFileCache, RemoteFileCache } from "./remote-file-cache";

let cache: RemoteFileCache | null | undefined;

const retryTimeoutInHours = 2 * 24; // 2 days

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
    throw new Error('The "globalStoragePath" field is required');
  }

  cache = await getRemoteFileCache(options.globalStoragePath);

  return Disposable.create(() => {
    cache?.dispose();
    cache = null;
  });
};

startServer(connection, runtime, onInitialize);

async function request(uri: string, etag: string | undefined, signal: AbortSignal): Promise<string> {
  const headers: HeadersInit = { "Accept-Encoding": "gzip, deflate" };
  if (etag) {
    headers["If-None-Match"] = etag;
  }

  try {
    const res = await fetch(uri, {
      redirect: "follow",
      follow: 5,
      signal: signal as any,
      headers,
    });

    const content = await res.text();

    if (cache) {
      const etag = res.headers.get("etag");
      if (typeof etag === "string") {
        await cache.put(uri, etag, content);
      }
    }

    return content;
  } catch (error: any) {
    if (error instanceof Response) {
      if (error.status === 304 && etag && cache) {
        const content = cache.get(uri, etag, true);
        return content ? content : request(uri, undefined, signal);
      }

      let message = error.statusText;
      const text = await error.text();
      if (error.statusText && text) {
        message = `${error.statusText}\n${text.substring(0, 200)}`;
      }
      if (!message) {
        message = error.toString();
      }

      throw new Error(message);
    }
    throw error;
  }
}
