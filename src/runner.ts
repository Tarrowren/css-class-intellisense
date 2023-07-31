import { CancellationToken, Disposable, FileStat, Uri, window } from "vscode";

export const logger = window.createOutputChannel("CSS Class Intellisense", { log: true });

export function logError(err: unknown, message: string, ...args: unknown[]): void {
  if (err instanceof Error || typeof err === "string") {
    return logger.error(err, message, ...args);
  }

  if (err) {
    return logger.error(err.toString(), message, ...args);
  }

  return logger.error(message, ...args);
}

export interface RuntimeEnvironment {
  readonly isBrowser: boolean;
  readonly request: {
    readFile(uri: Uri, token?: CancellationToken): Promise<Uint8Array>;
    stat(uri: Uri, token?: CancellationToken): Promise<FileStat>;
    clearCache?(): Promise<string[]>;
  };
  readonly timer: {
    setImmediate<TArgs extends unknown[]>(callback: (...args: TArgs) => void, ...args: TArgs): Disposable;
    setTimeout<TArgs extends unknown[]>(callback: (...args: TArgs) => void, ms: number, ...args: TArgs): Disposable;
    setInterval<TArgs extends unknown[]>(callback: (...args: TArgs) => void, ms: number, ...args: TArgs): Disposable;
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
          logError(e, errorMessage);
          resolve(errorVal);
        }
      }
    });
  });
}
