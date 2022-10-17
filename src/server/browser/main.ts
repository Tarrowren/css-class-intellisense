import {
  BrowserMessageReader,
  BrowserMessageWriter,
  createConnection,
  Disposable,
  RequestType,
} from "vscode-languageserver/browser";
import { RuntimeEnvironment } from "../runner";
import { startServer } from "../server";

const messageReader = new BrowserMessageReader(self);
const messageWriter = new BrowserMessageWriter(self);

const connection = createConnection(messageReader, messageWriter);

namespace VSCodeContentRequest {
  export const type: RequestType<string, string, void> = new RequestType(
    "vscode/content"
  );
}

const runtime: RuntimeEnvironment = {
  request: {
    getFileContent(uri) {
      return connection.sendRequest(VSCodeContentRequest.type, uri.toString());
    },
    getHttpContent(uri) {
      return {
        isDownloaded: false,
        content: fetch(uri, { mode: "cors" }).then((res) => res.text()),
      };
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
