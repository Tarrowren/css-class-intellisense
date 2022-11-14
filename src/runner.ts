import { CancellationToken, Disposable, FileStat, Uri } from "vscode";

export interface RuntimeEnvironment {
  readonly request: {
    readFile(uri: Uri, token?: CancellationToken): Promise<Uint8Array>;
    stat(uri: Uri, token?: CancellationToken): Promise<FileStat>;
  };
  readonly timer: {
    setImmediate<TArgs extends any[]>(callback: (...args: TArgs) => void, ...args: TArgs): Disposable;
    setTimeout<TArgs extends any[]>(callback: (...args: TArgs) => void, ms: number, ...args: TArgs): Disposable;
    setInterval<TArgs extends any[]>(callback: (...args: TArgs) => void, ms: number, ...args: TArgs): Disposable;
  };
  readonly util: {
    decode(input: Uint8Array, encoding?: string): string;
  };
}

export function formatError(message: string, err: any): string {
  if (err instanceof Error) {
    return `[${message}] ${err.message}\n${err.stack}`;
  } else if (typeof err === "string") {
    return `[${message}] ${err}`;
  } else if (err) {
    return `[${message}] ${err.toString()}`;
  }
  return `[${message}]`;
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
          console.error(formatError(errorMessage, e));
          resolve(errorVal);
        }
      }
    });
  });
}

export const EmptyDisposable = new Disposable(() => {});
