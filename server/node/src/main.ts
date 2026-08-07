import { Server } from "@cci/server-common";
import { CancellationError } from "@cci/server-common/src/cancellation";
import { install } from "@cci/server-common/src/env";
import { NoopSymbolStorage } from "@cci/server-common/src/symbol-storage";
import { withResolvers } from "@cci/shared";
import * as l10n from "@vscode/l10n";
import { readFile } from "node:fs/promises";
import { cpus } from "node:os";
import { type CancellationToken, createConnection, ProposedFeatures } from "vscode-languageserver/node";
import { FileSymbolStorage } from "./storage";

const connection = createConnection(ProposedFeatures.all);

process.on("unhandledRejection", (e) => {
  console.error("[UnhandledRejection]", e);
});

install({
  fs: {
    async fetchFile(url, token) {
      try {
        const response = await fetch(url, { signal: _to_abort_signal(token) });
        if (!response.ok) {
          throw new Error((await response.text()).substring(0, 200));
        }
        return await response.text();
      } catch (err) {
        connection.window.showErrorMessage(l10n.t("Failed to download {0}!\n{1}", url, (err as Error).message));
        throw err;
      }
    },
    async readFile(path, token) {
      return await readFile(path, { signal: _to_abort_signal(token) });
    },
  },
  os: {
    concurrency: Math.max(cpus().length, 4),
  },
  scheduler: {
    async wait(ms, token) {
      if (token.isCancellationRequested) {
        throw new CancellationError();
      }

      const { promise, resolve, reject } = withResolvers<void>();
      const timer = setTimeout(resolve, ms);
      const disposable = token.onCancellationRequested(() => {
        clearTimeout(timer);
        reject(new CancellationError());
      });
      try {
        await promise;
      } finally {
        disposable.dispose();
      }
    },
    async yield(token) {
      if (token.isCancellationRequested) {
        throw new CancellationError();
      }

      const { promise, resolve, reject } = withResolvers<void>();
      const timer = setImmediate(resolve);
      const disposable = token.onCancellationRequested(() => {
        clearImmediate(timer);
        reject(new CancellationError());
      });
      try {
        await promise;
      } finally {
        disposable.dispose();
      }
    },
  },
});

const _cache = new WeakMap<CancellationToken, AbortSignal>();
function _to_abort_signal(token: CancellationToken): AbortSignal | undefined {
  let signal = _cache.get(token);
  if (!signal) {
    if (token.isCancellationRequested) {
      signal = AbortSignal.abort(new CancellationError());
    } else {
      const controller = new AbortController();
      token.onCancellationRequested(() => {
        controller.abort(new CancellationError());
      });

      signal = controller.signal;
    }

    _cache.set(token, signal);
  }

  return signal;
}

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
