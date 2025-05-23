import { Server } from "server-common";
import {
  BrowserMessageReader,
  BrowserMessageWriter,
  CancellationToken,
  createConnection,
  ProposedFeatures,
} from "vscode-languageserver/browser";

const messageReader = new BrowserMessageReader(self);
const messageWriter = new BrowserMessageWriter(self);

const connection = createConnection(ProposedFeatures.all, messageReader, messageWriter);

const _global = self as unknown as Record<string, unknown>;

_global.logger = connection.console;
_global.scheduler = {
  wait(ms: number, token?: CancellationToken): Promise<void> {
    if (token?.isCancellationRequested) {
      return Promise.reject(new Error("cancelled"));
    }

    return new Promise<void>((c, e) => {
      const timer = setTimeout(c, ms);
      token?.onCancellationRequested(() => {
        clearTimeout(timer);
        e(new Error("cancelled"));
      });
    });
  },
  yield(): Promise<void> {
    return new Promise<void>((c) => setTimeout(c, 0));
  },
};

Server.create(connection);
