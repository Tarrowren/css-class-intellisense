import { Client } from "client-common";
import { Uri, type ExtensionContext } from "vscode";
import { LanguageClient } from "vscode-languageclient/browser";

let client: Client | null | undefined;

export async function activate(context: ExtensionContext) {
  const server = Uri.joinPath(context.extensionUri, "dist/browser/server.iife.js").toString();

  let databaseName = context.workspaceState.get<string>("dbName");
  if (!databaseName) {
    databaseName = `anycode_${random()}`;
    await context.workspaceState.update("dbName", databaseName);
  }

  client = Client.create(
    (id, name, clientOptions) => {
      const worker = new Worker(server);
      return new LanguageClient(id, name, clientOptions, worker);
    },
    context,
    { databaseName },
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

const byteToHex: string[] = [];
for (let i = 0; i < 256; ++i) {
  byteToHex.push((i + 0x100).toString(16).slice(1));
}
function stringify(arr: Uint8Array): string {
  return (
    byteToHex[arr[0]] +
    byteToHex[arr[1]] +
    byteToHex[arr[2]] +
    byteToHex[arr[3]] +
    byteToHex[arr[4]] +
    byteToHex[arr[5]] +
    byteToHex[arr[6]] +
    byteToHex[arr[7]]
  ).toLowerCase();
}

function random(): string {
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  return stringify(buf);
}
