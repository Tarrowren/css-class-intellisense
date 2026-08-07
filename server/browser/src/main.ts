import { Server } from "@cci/server-common";
import { CancellationError } from "@cci/server-common/src/cancellation";
import { install } from "@cci/server-common/src/env";
import { NoopSymbolStorage } from "@cci/server-common/src/symbol-storage";
import { withResolvers } from "@cci/shared";
import * as l10n from "@vscode/l10n";
import {
  BrowserMessageReader,
  BrowserMessageWriter,
  type CancellationToken,
  createConnection,
  ProposedFeatures,
} from "vscode-languageserver/browser";
import { IndexedDBSymbolStorage } from "./storage";

const messageReader = new BrowserMessageReader(self);
const messageWriter = new BrowserMessageWriter(self);

const connection = createConnection(ProposedFeatures.all, messageReader, messageWriter);

install({
  fs: {
    async fetchFile(url, token) {
      try {
        const response = await fetch(url, { cache: "no-cache", signal: _to_abort_signal(token) });
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
    concurrency: Math.max(navigator.hardwareConcurrency, 4),
  },
  scheduler: {
    wait: _wait,
    yield: typeof globalThis.queueMicrotask === "function" ? _yield : _polyfill_yield,
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

async function _wait(ms: number, token: CancellationToken) {
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
}

async function _yield(token: CancellationToken) {
  if (token.isCancellationRequested) {
    throw new CancellationError();
  }

  const { promise, resolve, reject } = withResolvers<void>();
  queueMicrotask(resolve);
  const disposable = token.onCancellationRequested(() => {
    reject(new CancellationError());
  });
  try {
    await promise;
  } finally {
    disposable.dispose();
  }
}

async function _polyfill_yield(token: CancellationToken) {
  await _wait(0, token);
}

Server.create(connection, {
  async create(options) {
    try {
      return await IndexedDBSymbolStorage.create(options.databaseName);
    } catch (_) {
      return new NoopSymbolStorage();
    }
  },
});
