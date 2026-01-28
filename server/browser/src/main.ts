import * as l10n from "@vscode/l10n";
import { Server } from "server-common";
import { NoopSymbolStorage } from "server-common/src/symbol-storage";
import { withResolvers } from "shared";
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
    return new Promise<void>((c) => setTimeout(c, 0));
  },
};

_global.concurrency = navigator.hardwareConcurrency ?? 4;
_global.fs = {
  async readHttpFile(url: string): Promise<string> {
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
