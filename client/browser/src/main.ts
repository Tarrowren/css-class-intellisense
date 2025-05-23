import { Client } from "client-common";
import { Uri, type ExtensionContext } from "vscode";
import { LanguageClient } from "vscode-languageclient/browser";

let client: Client | null | undefined;

export async function activate(context: ExtensionContext) {
  const server = Uri.joinPath(context.extensionUri, "dist/browser/server.js").toString();

  client = Client.create((id, name, clientOptions) => {
    const worker = new Worker(server);
    return new LanguageClient(id, name, clientOptions, worker);
  }, context);

  await client.start();
}

export async function deactivate() {
  if (!client) {
    return;
  }

  await client.stop();
  client = null;
}
