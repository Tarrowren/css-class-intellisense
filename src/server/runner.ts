import {
  CancellationToken,
  Disposable,
  LSPErrorCodes,
  ResponseError,
} from "vscode-languageserver/node";

const timer = {
  setImmediate<TArgs extends any[]>(
    callback: (...args: TArgs) => void,
    ...args: TArgs
  ): Disposable {
    const handle = setImmediate(callback, ...args);
    return { dispose: () => clearImmediate(handle) };
  },
  setTimeout<TArgs extends any[]>(
    callback: (...args: TArgs) => void,
    ms?: number,
    ...args: TArgs
  ): Disposable {
    const handle = setTimeout(callback, ms, ...args);
    return { dispose: () => clearTimeout(handle) };
  },
};

export function formatError(message: string, err: any): string {
  if (err instanceof Error) {
    return `${message}: ${err.message}\n${err.stack}`;
  } else if (typeof err === "string") {
    return `${message}: ${err}`;
  } else if (err) {
    return `${message}: ${err.toString()}`;
  }
  return message;
}

export function runSafe<T>(
  func: () => Promise<T>,
  errorVal: T,
  errorMessage: string,
  token: CancellationToken
): Promise<T | ResponseError<any>> {
  return new Promise<T | ResponseError<any>>((resolve) => {
    timer.setImmediate(() => {
      if (token.isCancellationRequested) {
        resolve(cancelValue());
        return;
      }
      return func().then(
        (result) => {
          if (token.isCancellationRequested) {
            resolve(cancelValue());
            return;
          } else {
            resolve(result);
          }
        },
        (e) => {
          console.error(formatError(errorMessage, e));
          resolve(errorVal);
        }
      );
    });
  });
}

function cancelValue<E>() {
  return new ResponseError<E>(
    LSPErrorCodes.RequestCancelled,
    "Request cancelled"
  );
}
