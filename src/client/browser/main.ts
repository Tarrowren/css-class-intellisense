import { ExtensionContext, Uri } from "vscode";
import {
  BaseLanguageClient,
  LanguageClient,
} from "vscode-languageclient/browser";
import { startClient } from "../client";

declare const Worker: {
  new (stringUrl: string): any;
};

declare function fetch(uri: string, options: any): any;

let client: BaseLanguageClient | null | undefined;

export async function activate(context: ExtensionContext) {
  const serverModule = Uri.joinPath(
    context.extensionUri,
    "out/server/browser/main.js"
  ).toString();

  const worker = new Worker(serverModule);

  client = await startClient(
    context,
    (id, name, clientOptions) => {
      return new LanguageClient(id, name, clientOptions, worker);
    },
    {
      request: {
        getContent: async (uri: string) => {
          const response = await fetch(uri, { mode: "cors" });
          return response.text();
        },
      },
    }
  );
}

export async function deactivate() {
  if (client) {
    await client.stop();
    client = null;
  }
}
