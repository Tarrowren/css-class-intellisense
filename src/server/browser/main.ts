import {
  BrowserMessageReader,
  BrowserMessageWriter,
  CancellationTokenSource,
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
  export const type: RequestType<string, string, void> = new RequestType("vscode/content");
}

const runtime: RuntimeEnvironment = {
  file: {
    getContent(uri) {
      const source = new CancellationTokenSource();

      return {
        isLocal: true,
        content: connection.sendRequest(VSCodeContentRequest.type, uri.toString(), source.token),
        dispose() {
          source.cancel();
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
          mode: "cors",
          cache: "no-cache",
          signal: controller.signal,
        }).then((res) => res.text()),
        dispose() {
          // see https://github.com/microsoft/TypeScript/issues/49609
          (controller as any).abort();
        },
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
    setInterval(callback, ms?, ...args) {
      const handle = setInterval(callback, ms, ...args);
      return Disposable.create(() => clearInterval(handle));
    },
  },
};

startServer(connection, runtime);
