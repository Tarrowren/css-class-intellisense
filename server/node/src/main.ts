import { Server } from "@cci/server-common";
import { install } from "@cci/server-common/src/env";
import { NoopSymbolStorage } from "@cci/server-common/src/symbol-storage";
import { withResolvers } from "@cci/shared";
import * as l10n from "@vscode/l10n";
import { readFile } from "node:fs/promises";
import { cpus } from "node:os";
import { createConnection, ProposedFeatures } from "vscode-languageserver/node";
import { FileSymbolStorage } from "./storage";

const connection = createConnection(ProposedFeatures.all);

process.on("unhandledRejection", (e) => {
  console.error("[UnhandledRejection]", e);
});

install({
  fs: {
    async fetchFile(url, _token) {
      // TODO token
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error((await response.text()).substring(0, 200));
        }
        return await response.text();
      } catch (err) {
        connection.window.showErrorMessage(l10n.t("Failed to download {0}!\n{1}", url, (err as Error).message));
        throw err;
      }
    },
    async readFile(path, _token) {
      // TODO token
      return await readFile(path);
    },
  },
  os: {
    get concurrency() {
      return cpus().length;
    },
  },
  scheduler: {
    async wait(ms, token) {
      const { promise, resolve, reject } = withResolvers<void>();
      const timer = setTimeout(resolve, ms);
      const disposable = token?.onCancellationRequested(() => {
        clearTimeout(timer);
        reject(new Error("cancelled"));
      });
      try {
        await promise;
      } finally {
        disposable?.dispose();
      }
    },
    async yield(token) {
      const { promise, resolve, reject } = withResolvers<void>();
      const timer = setImmediate(resolve);
      const disposable = token?.onCancellationRequested(() => {
        clearImmediate(timer);
        reject(new Error("cancelled"));
      });
      try {
        await promise;
      } finally {
        disposable?.dispose();
      }
    },
  },
});

Server.create(connection, {
  async create(options) {
    try {
      if (options.storagePath) {
        return FileSymbolStorage.create(options.databaseName, options.storagePath);
      }
    } catch (_) {
      // ignore
    }

    return new NoopSymbolStorage();
  },
});
