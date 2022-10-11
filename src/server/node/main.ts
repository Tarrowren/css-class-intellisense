import { readFile } from "fs/promises";
import { getErrorStatusDescription, xhr } from "request-light";
import { format } from "util";
import { createConnection, Disposable } from "vscode-languageserver/node";
import { formatError, RuntimeEnvironment } from "../runner";
import { startServer } from "../server";
import { getGlobalStorage, GlobalStorage } from "./globalStorage";

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
  request: {
    async getFileContent(uri) {
      return await readFile(uri.fsPath, "utf8");
    },
    async getHttpContent(url) {
      const globalStorage = await lazyGlobalStorage();
      let content = await globalStorage.get(url);
      if (!content) {
        const headers = { "Accept-Encoding": "gzip, deflate" };
        try {
          const resp = await xhr({
            url,
            followRedirects: 5,
            headers,
            timeout: 10000,
          });
          content = resp.responseText;
        } catch (e: any) {
          throw new Error(
            e.responseText ??
              getErrorStatusDescription(e.status) ??
              e.toString()
          );
        }

        await globalStorage.update(url, content);
      }
      return content;
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

startServer(connection, runtime);

const lazyGlobalStorage = (() => {
  let _globalStoragePromise: Promise<GlobalStorage> | undefined;
  let _globalStorage: GlobalStorage | undefined;

  return async () => {
    if (!_globalStorage) {
      if (!_globalStoragePromise) {
        _globalStoragePromise = getGlobalStorage(connection);
      }
      _globalStorage = await _globalStoragePromise;
    }

    return _globalStorage;
  };
})();
