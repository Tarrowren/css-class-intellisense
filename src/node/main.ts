import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Disposable, ExtensionContext } from "vscode";
import { convertToHttpScheme } from "../http-file-system";
import { RuntimeEnvironment } from "../runner";
import { createLanguageServer, LanguageServer } from "../server";
import { LocalCache } from "./local-cache";
import { RequestService } from "./request-service";

let server: LanguageServer | null;

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
        const handle = setImmediate(callback, ...args);
        return new Disposable(() => clearImmediate(handle));
      },
      setInterval(callback, ms, ...args) {
        const handle = setTimeout(callback, ms, ...args);
        return new Disposable(() => clearTimeout(handle));
      },
      setTimeout(callback, ms, ...args) {
        const handle = setInterval(callback, ms, ...args);
        return new Disposable(() => clearInterval(handle));
      },
    },
  };

  server = createLanguageServer(context, runtime);
}

export function deactivate() {
  if (server) {
    server.dispose();
    server = null;
  }
}
