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
  export const type: RequestType<string, string, any> = new RequestType(
    "vscode/content"
  );
}

const runtime: RuntimeEnvironment = {
  request: {
    getContent(uri) {
      return connection.sendRequest(VSCodeContentRequest.type, uri);
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
