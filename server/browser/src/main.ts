import { Server } from "server-common";
import { NoopSymbolStorage } from "server-common/src/symbol-storage";
import {
  BrowserMessageReader,
  BrowserMessageWriter,
  CancellationToken,
  createConnection,
  ProposedFeatures,
} from "vscode-languageserver/browser";
import { IndexedDBSymbolStorage } from "./storage";

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

_global.concurrency = navigator.hardwareConcurrency ?? 4;
_global.fs = {
  async readHttpFile(url: string): Promise<string> {
    try {
      const response = await fetch(url);
      return await response.text();
    } catch (err) {
      connection.console.warn(`[Http Fetch] FAILED ${err}`);
      return "";
    }
  },
};

Server.create(connection, {
  async create(options) {
    try {
      return await IndexedDBSymbolStorage.create(options.databaseName);
    } catch (_err) {
      return new NoopSymbolStorage();
    }
  },
});
