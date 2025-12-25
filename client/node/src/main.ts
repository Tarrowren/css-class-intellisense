import { Client } from "client-common";
import { Uri, type ExtensionContext } from "vscode";
import { LanguageClient, TransportKind, type ServerOptions } from "vscode-languageclient/node";

let client: Client | null | undefined;

export async function activate(context: ExtensionContext) {
  const server = Uri.joinPath(context.extensionUri, "dist/node/server.cjs").fsPath;

  client = Client.create(
    (id, name, clientOptions) => {
      const serverOptions: ServerOptions = { module: server, transport: TransportKind.ipc };
      return new LanguageClient(id, name, serverOptions, clientOptions);
    },
    context,
    { databaseName: "css_class_intellisense", storagePath: context.storageUri?.fsPath },
  );

  await client.start();
}

export async function deactivate() {
  if (!client) {
    return;
  }

  await client.stop();
  client = null;
}
