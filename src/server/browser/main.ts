import {
  BrowserMessageReader,
  BrowserMessageWriter,
  createConnection,
  Disposable,
  RequestType,
} from "vscode-languageserver/browser";
import { RuntimeEnvironment } from "../runner";
import { startServer } from "../server";

declare let self: any;

const messageReader = new BrowserMessageReader(self);
const messageWriter = new BrowserMessageWriter(self);

const connection = createConnection(messageReader, messageWriter);

namespace VSCodeContentRequest {
  export const file_content: RequestType<string, string, any> = new RequestType(
    "vscode/file-content"
  );
  export const http_content: RequestType<string, string, any> = new RequestType(
    "vscode/http-content"
  );
}

const runtime: RuntimeEnvironment = {
  request: {
    getFileContent(uri) {
      return connection.sendRequest(
        VSCodeContentRequest.file_content,
        uri.toString()
      );
    },
    getHttpContent(url) {
      return connection.sendRequest(VSCodeContentRequest.http_content, url);
    },
  },
  timer: {
    setImmediate: (callback, ...args) => {
      const handle = setTimeout(callback, 0, ...args);
      return Disposable.create(() => clearTimeout(handle));
    },
    setTimeout: (callback, ms, ...args) => {
      const handle = setTimeout(callback, ms, ...args);
      return Disposable.create(() => clearTimeout(handle));
    },
  },
};

startServer(connection, runtime);
