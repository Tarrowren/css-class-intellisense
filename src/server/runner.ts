import { CancellationToken, Disposable, LSPErrorCodes, ResponseError } from "vscode-languageserver";
import { URI } from "vscode-uri";

export const noop = () => {};

export interface RequestContentResult extends Disposable {
  isLocal: boolean;
  content: Promise<string>;
}

export interface RequestService {
  getContent(uri: URI): RequestContentResult;
}

export interface RuntimeEnvironment {
  file: RequestService;
  http: RequestService;
  readonly timer: {
    setImmediate<TArgs extends any[]>(callback: (...args: TArgs) => void, ...args: TArgs): Disposable;
    setTimeout<TArgs extends any[]>(callback: (...args: TArgs) => void, ms: number, ...args: TArgs): Disposable;
    setInterval<TArgs extends any[]>(callback: (...args: TArgs) => void, ms: number, ...args: TArgs): Disposable;
  };
}

export function formatError(message: string, err: any): string {
  if (err instanceof Error) {
    if (err.name === "AbortError") {
      return `${message}: ${err.message}`;
    } else {
      return `${message}: ${err.message}\n${err.stack}`;
    }
  } else if (typeof err === "string") {
    return `${message}: ${err}`;
  } else if (err) {
    return `${message}: ${err.toString()}`;
  }
  return message;
}

export function runSafeAsync<T, E>(
  runtime: RuntimeEnvironment,
  func: () => Promise<T>,
  errorVal: T,
  errorMessage: string,
  token: CancellationToken
): Promise<T | ResponseError<E>> {
  return new Promise<T | ResponseError<E>>((resolve) => {
    runtime.timer.setImmediate(async () => {
      if (token.isCancellationRequested) {
        resolve(cancelValue());
      } else {
        try {
          const result = await func();
          if (token.isCancellationRequested) {
            resolve(cancelValue());
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

export function runSafe<T, E>(
  runtime: RuntimeEnvironment,
  func: () => T,
  errorVal: T,
  errorMessage: string,
  token: CancellationToken
): Promise<T | ResponseError<E>> {
  return new Promise<T | ResponseError<E>>((resolve) => {
    runtime.timer.setImmediate(() => {
      if (token.isCancellationRequested) {
        resolve(cancelValue());
      } else {
        try {
          const result = func();
          if (token.isCancellationRequested) {
            resolve(cancelValue());
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

function cancelValue<E>() {
  console.log("cancelled");
  return new ResponseError<E>(LSPErrorCodes.RequestCancelled, "Request cancelled");
}