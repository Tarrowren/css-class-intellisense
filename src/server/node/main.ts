import { readFile } from "fs/promises";
import fetch from "node-fetch";
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
      const controller = new AbortController();

      return {
        isLocal: false,
        content: fetch(uri.toString(), {
          redirect: "follow",
          follow: 5,
          signal: controller.signal as any,
        }).then((res) => res.text()),
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

// , async (options) => {
//   if (!options || !options.globalStoragePath || typeof options.globalStoragePath !== "string") {
//     throw new Error('The "globalStoragePath" field is required');
//   }

//   remoteFileCache = await getRemoteFileCache(options.globalStoragePath);

//   return AsyncDisposable.create(async () => {
//     await remoteFileCache?.dispose();
//     remoteFileCache = null;
//   });
// }

startServer(connection, runtime);
