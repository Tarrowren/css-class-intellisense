import { readFile } from "fs/promises";
import { getErrorStatusDescription, xhr } from "request-light";
import { format } from "util";
import { createConnection, Disposable } from "vscode-languageserver/node";
import { formatError, RuntimeEnvironment } from "../runner";
import { startServer } from "../server";

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
    async getFileContent(path) {
      return await readFile(path, "utf8");
    },
    async getHttpContent(url) {
      const headers = { "Accept-Encoding": "gzip, deflate" };
      try {
        const resp = await xhr({ url, followRedirects: 5, headers });
        return resp.responseText;
      } catch (e: any) {
        throw new Error(
          e.responseText ?? getErrorStatusDescription(e.status) ?? e.toString()
        );
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

startServer(connection, runtime);
