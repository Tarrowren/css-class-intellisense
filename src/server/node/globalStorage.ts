import { createHash } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import { extname, join } from "path";
import { Connection, RequestType0 } from "vscode-languageserver/node";
import { URI } from "vscode-uri";

namespace VSCodeStorageRequest {
  export const global_storage_uri: RequestType0<string, void> =
    new RequestType0("vscode/global-storage-uri");
}

export async function getGlobalStorage(
  connection: Connection
): Promise<GlobalStorage> {
  const globalStorageUri = await connection.sendRequest(
    VSCodeStorageRequest.global_storage_uri
  );
  const uri = URI.parse(globalStorageUri);

  const cacheLocation = join(uri.fsPath, "file-cache");
  await mkdir(cacheLocation, { recursive: true });

  function getCacheFilePath(url: string) {
    const ext = extname(url);
    const fileName = `${createHash("MD5").update(url).digest("hex")}${ext}`;
    return join(cacheLocation, fileName);
  }

  return {
    async get(url) {
      try {
        const path = getCacheFilePath(url);
        return await readFile(path, "utf8");
      } catch (e) {
        return undefined;
      }
    },
    async update(url, content) {
      const path = getCacheFilePath(url);
      return await writeFile(path, content, "utf8");
    },
  };
}

export interface GlobalStorage {
  get(url: string): Promise<string | undefined>;
  update(url: string, content: string): Promise<void>;
}
