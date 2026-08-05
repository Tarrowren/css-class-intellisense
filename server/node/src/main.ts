import { Server } from "@cci/server-common";
import { NoopSymbolStorage } from "@cci/server-common/src/symbol-storage";
import { withResolvers } from "@cci/shared";
import * as l10n from "@vscode/l10n";
import { readFile } from "node:fs/promises";
import { cpus } from "node:os";
import { CancellationToken, createConnection, ProposedFeatures } from "vscode-languageserver/node";
import { FileSymbolStorage } from "./storage";

const connection = createConnection(ProposedFeatures.all);

process.on("unhandledRejection", (e) => {
  connection.console.error(`Unhandled exception\n${e}`);
});

const _global = global as unknown as Record<string, unknown>;

_global.logger = connection.console;
_global.scheduler = {
  async wait(ms: number, token?: CancellationToken): Promise<void> {
    if (token?.isCancellationRequested) {
      throw new Error("cancelled");
    }

    const { promise, resolve, reject } = withResolvers<void>();
    const timer = setTimeout(resolve, ms);
    const disposable = token?.onCancellationRequested(() => {
      clearTimeout(timer);
      reject(new Error("canceled"));
    });
    try {
      await promise;
    } finally {
      disposable?.dispose();
    }
  },
  yield(): Promise<void> {
    return new Promise<void>((c) => setImmediate(c));
  },
};

_global.concurrency = cpus().length;
_global.fs = {
  async readFile(path: string): Promise<Uint8Array> {
    return await readFile(path);
  },
  async readHttpFile(url: string): Promise<string> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error((await response.text()).substring(0, 200));
      }
      return await response.text();
    } catch (err) {
      connection.window.showErrorMessage(
        l10n.t("Failed to download {0}!\n{1}", url, (err as NodeJS.ErrnoException).message),
      );
      throw err;
    }
  },
};

Server.create(connection, {
  async create(options) {
    try {
      if (options.storagePath) {
        return FileSymbolStorage.create(options.databaseName, options.storagePath);
      }
    } catch (_err) {
      // ignore
    }

    return new NoopSymbolStorage();
  },
});
