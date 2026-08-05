import { Server } from "@cci/server-common";
import { install } from "@cci/server-common/src/env";
import { NoopSymbolStorage } from "@cci/server-common/src/symbol-storage";
import { withResolvers } from "@cci/shared";
import * as l10n from "@vscode/l10n";
import {
  BrowserMessageReader,
  BrowserMessageWriter,
  createConnection,
  ProposedFeatures,
} from "vscode-languageserver/browser";
import { IndexedDBSymbolStorage } from "./storage";

const messageReader = new BrowserMessageReader(self);
const messageWriter = new BrowserMessageWriter(self);

const connection = createConnection(ProposedFeatures.all, messageReader, messageWriter);

install({
  fs: {
    async fetchFile(url, _token) {
      // TODO token
      try {
        const response = await fetch(url, { cache: "no-cache" });
        if (!response.ok) {
          throw new Error((await response.text()).substring(0, 200));
        }
        return await response.text();
      } catch (err) {
        connection.window.showErrorMessage(l10n.t("Failed to download {0}!\n{1}", url, (err as Error).message));
        throw err;
      }
    },
  },
  os: {
    get concurrency() {
      return navigator.hardwareConcurrency ?? 4;
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
      await this.wait(0, token);
    },
  },
});

Server.create(connection, {
  async create(options) {
    try {
      return await IndexedDBSymbolStorage.create(options.databaseName);
    } catch (_err) {
      return new NoopSymbolStorage();
    }
  },
});
