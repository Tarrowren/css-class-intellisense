import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Disposable, ExtensionContext } from "vscode";
import { convertToHttpScheme } from "../http-file-system";
import { RuntimeEnvironment, log } from "../runner";
import { GlobalLanguageServer, LanguageServer } from "../server";
import { LocalCache } from "./local-cache";
import { RequestService } from "./request-service";

let server: LanguageServer | null;

process.on("unhandledRejection", (e) => {
  log.error(e as any, "unhandled exception");
});

export async function activate(context: ExtensionContext) {
  const globalStorage = context.globalStorageUri;
  const cacheLocation = join(globalStorage.fsPath, LocalCache.MEMENTO_KEY);
  await mkdir(cacheLocation, { recursive: true });
  const localCache = new LocalCache(cacheLocation, context.globalState);
  const request = new RequestService(localCache);

  const runtime: RuntimeEnvironment = {
    isBrowser: false,
    request: {
      async readFile(uri, token) {
        uri = convertToHttpScheme(uri);
        return await request.readFile(uri, token);
      },
      async stat(uri, token) {
        uri = convertToHttpScheme(uri);
        return await request.stat(uri, token);
      },
      async clearCache() {
        if (localCache) {
          return await localCache.clearCache();
        } else {
          return [];
        }
      },
    },
    timer: {
      setImmediate(callback, ...args) {
        const immediate = setImmediate(callback, ...args);
        return new Disposable(() => clearImmediate(immediate));
      },
      setTimeout(callback, ms, ...args) {
        const timeout = setTimeout(callback, ms, ...args);
        return new Disposable(() => clearTimeout(timeout));
      },
      setInterval(callback, ms, ...args) {
        const timer = setInterval(callback, ms, ...args);
        return new Disposable(() => clearInterval(timer));
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
