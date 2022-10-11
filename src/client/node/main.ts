import { ExtensionContext } from "vscode";
import {
  BaseLanguageClient,
  LanguageClient,
  RequestType0,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";
import { startClient } from "../client";

let client: BaseLanguageClient | null | undefined;

namespace VSCodeStorageRequest {
  export const global_storage_uri: RequestType0<string, void> =
    new RequestType0("vscode/global-storage-uri");
}

export async function activate(context: ExtensionContext) {
  const serverModule = context.asAbsolutePath("out/server/node/main.js");

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ["--nolazy", "--inspect=6009"] },
    },
  };

  client = await startClient(
    context,
    (id, name, clientOptions) => {
      return new LanguageClient(id, name, serverOptions, clientOptions);
    },
    (client) => {
      client.onRequest(VSCodeStorageRequest.global_storage_uri, () => {
        return context.globalStorageUri.toString();
      });
    }
  );
}

export async function deactivate() {
  if (client) {
    await client.stop();
    client = null;
  }
}
