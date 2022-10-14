import { readFile } from "fs/promises";
import { getErrorStatusDescription, xhr, XHRResponse } from "request-light";
import { format } from "util";
import { createConnection, Disposable } from "vscode-languageserver/node";
import { AsyncDisposable, formatError, RuntimeEnvironment } from "../runner";
import { startServer } from "../server";
import { getRemoteFileCache, RemoteFileCache } from "./remoteFileCache";

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

let remoteFileCache: RemoteFileCache | null | undefined;

const runtime: RuntimeEnvironment = {
  request: {
    async getFileContent(uri) {
      return await readFile(uri.fsPath, "utf8");
    },
    getHttpContent(uri) {
      const content = remoteFileCache?.get(uri);
      if (content) {
        return { isDownloaded: true, content };
      } else {
        return { isDownloaded: false, content: downloadFile(uri) };
      }
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
  },
};

startServer(connection, runtime, async (options) => {
  if (
    !options ||
    !options.globalStoragePath ||
    typeof options.globalStoragePath !== "string"
  ) {
    throw new Error('The "globalStoragePath" field is required');
  }

  remoteFileCache = await getRemoteFileCache(options.globalStoragePath);

  return AsyncDisposable.create(async () => {
    await remoteFileCache?.dispose();
    remoteFileCache = null;
  });
});

async function downloadFile(url: string) {
  const headers = { "Accept-Encoding": "gzip, deflate" };

  let resp: XHRResponse | undefined;
  try {
    resp = await xhr({
      url,
      followRedirects: 5,
      headers,
      timeout: 10000,
    });
  } catch (e: any) {
    throw new Error(
      e.responseText ?? getErrorStatusDescription(e.status) ?? e.toString()
    );
  }

  const content = resp.responseText;
  await remoteFileCache?.update(url, content);

  return content;
}
