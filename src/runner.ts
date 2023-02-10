import pino, { LoggerOptions } from "pino";
import { CancellationToken, Disposable, FileStat, Uri, window } from "vscode";

export const log = (() => {
  const channel = window.createOutputChannel("CSS Class Intellisense");

  return pino<LoggerOptions>(
    {
      level: "debug",
      browser: {
        serialize: true,
        write(o) {
          channel.appendLine(JSON.stringify(o));
        },
      },
    },
    {
      write(msg) {
        channel.append(msg);
      },
    }
  );
})();

export interface RuntimeEnvironment {
  readonly isBrowser: boolean;
  readonly request: {
    readFile(uri: Uri, token?: CancellationToken): Promise<Uint8Array>;
    stat(uri: Uri, token?: CancellationToken): Promise<FileStat>;
    clearCache?(): Promise<string[]>;
  };
  readonly timer: {
    setImmediate<TArgs extends any[]>(callback: (...args: TArgs) => void, ...args: TArgs): Disposable;
    setTimeout<TArgs extends any[]>(callback: (...args: TArgs) => void, ms: number, ...args: TArgs): Disposable;
    setInterval<TArgs extends any[]>(callback: (...args: TArgs) => void, ms: number, ...args: TArgs): Disposable;
  };
}

export function runSafeAsync<T>(
  runtime: RuntimeEnvironment,
  run: () => Promise<T>,
  errorVal: T,
  errorMessage: string,
  token: CancellationToken
): Promise<T> {
  return new Promise<T>((resolve) => {
    runtime.timer.setImmediate(async () => {
      if (token.isCancellationRequested) {
        resolve(errorVal);
      } else {
        try {
          const result = await run();
          if (token.isCancellationRequested) {
            resolve(errorVal);
          } else {
            resolve(result);
          }
        } catch (e) {
          log.error(e, errorMessage);
          resolve(errorVal);
        }
      }
    });
  });
}
