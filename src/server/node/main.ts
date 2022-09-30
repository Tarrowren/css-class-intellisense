import { readFile } from "fs";
import { getErrorStatusDescription, xhr, XHRResponse } from "request-light";
import { format } from "util";
import { createConnection, Disposable } from "vscode-languageserver/node";
import { URI } from "vscode-uri";
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
    getContent: (url) => {
      const uri = URI.parse(url);
      const protocol = uri.scheme;

      if (protocol === "file") {
        return new Promise((resolve, reject) => {
          readFile(uri.fsPath, "utf8", (err, buf) => {
            if (err) {
              reject(err);
            } else {
              resolve(buf);
            }
          });
        });
      } else if (protocol === "http" || protocol === "https") {
        const headers = { "Accept-Encoding": "gzip, deflate" };
        return xhr({ url: url, followRedirects: 5, headers }).then(
          (response) => {
            return response.responseText;
          },
          (error: XHRResponse) => {
            throw new Error(
              error.responseText ||
                getErrorStatusDescription(error.status) ||
                error.toString()
            );
          }
        );
      } else {
        throw new Error("Unimplemented");
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
