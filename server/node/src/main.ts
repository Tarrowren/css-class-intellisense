import { Server } from "server-common";
import { CancellationToken, createConnection, ProposedFeatures } from "vscode-languageserver/node";

const connection = createConnection(ProposedFeatures.all);

process.on("unhandledRejection", (e) => {
  connection.console.error(`Unhandled exception\n${e}`);
});

const _global = global as unknown as Record<string, unknown>;

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
    return new Promise<void>((c) => setImmediate(c));
  },
};

Server.create(connection);
