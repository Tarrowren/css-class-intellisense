import { CancellationToken, Disposable, ExtensionContext, FilePermission, FileType } from "vscode";
import { convertToHttpScheme } from "../http-file-system";
import { RuntimeEnvironment } from "../runner";
import { GlobalLanguageServer, LanguageServer } from "../server";
import { setImmediate } from "./timer";

let server: LanguageServer | null;

export function activate(context: ExtensionContext) {
  const runtime: RuntimeEnvironment = {
    isBrowser: true,
    request: {
      async readFile(uri, token) {
        uri = convertToHttpScheme(uri);

        const signal = toSignal(token);

        const res = await fetch(uri.toString(true), { method: "GET", mode: "cors", signal });

        if (res.ok) {
          return new Uint8Array(await res.arrayBuffer());
        } else {
          throw new Error(`Error: ${res.statusText}`);
        }
      },
      async stat(uri, token) {
        uri = convertToHttpScheme(uri);

        const signal = toSignal(token);

        const res = await fetch(uri.toString(true), { method: "HEAD", mode: "cors", signal });

        if (res.ok) {
          const contentLength = res.headers.get("content-length");

          return {
            type: FileType.File,
            ctime: 0,
            mtime: 0,
            size: contentLength ? Number.parseInt(contentLength) : 0,
            permissions: FilePermission.Readonly,
          };
        } else {
          throw new Error(`Error: ${res.statusText}`);
        }
      },
    },
    timer: {
      setImmediate,
      setTimeout(callback, ms, ...args) {
        const id = setTimeout(callback, ms, ...args);
        return new Disposable(() => clearTimeout(id));
      },
      setInterval(callback, ms, ...args) {
        const id = setInterval(callback, ms, ...args);
        return new Disposable(() => clearInterval(id));
      },
      timestamp() {
        return Date.now();
      },
    },
  };

  server = new GlobalLanguageServer(context, runtime);
}

export function deactivate() {
  if (server) {
    server.dispose();
    server = null;
  }
}

function toSignal(token?: CancellationToken): AbortSignal | undefined {
  if (!token) {
    return;
  }

  const controller = new AbortController();

  if (token.isCancellationRequested) {
    controller.abort();
  } else {
    token.onCancellationRequested(() => {
      controller.abort();
    });
  }

  return controller.signal;
}
