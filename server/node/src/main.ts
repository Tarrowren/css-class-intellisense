import { cpus } from "node:os";
import { Logger, Server } from "server-common";
import { NoopSymbolStorage } from "server-common/src/symbol-storage";
import { CancellationToken, createConnection, ProposedFeatures } from "vscode-languageserver/node";
import { FileSymbolStorage } from "./storage";

const connection = createConnection(ProposedFeatures.all);

process.on("unhandledRejection", (e) => {
  connection.console.error(`Unhandled exception\n${e}`);
});

const _global = global as unknown as Record<string, unknown>;

_global.logger = Logger.create(connection.console);
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
    return new Promise<void>((c) => setImmediate(c));
  },
};

_global.concurrency = cpus().length;

Server.create(connection, {
  async create(options) {
    try {
      if (options.storagePath) {
        return await FileSymbolStorage.create(options.databaseName, options.storagePath);
      } else {
        return new NoopSymbolStorage();
      }
    } catch (_err) {
      return new NoopSymbolStorage();
    }
  },
});
