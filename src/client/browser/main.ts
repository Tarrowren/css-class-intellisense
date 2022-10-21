import { ExtensionContext, Uri, workspace } from "vscode";
import { BaseLanguageClient, LanguageClient, RequestType, ResponseError } from "vscode-languageclient/browser";
import { LanguageClientConstructor, onLanguageClientInitialize, startClient } from "../client";

let client: BaseLanguageClient | null | undefined;

namespace VSCodeContentRequest {
  export const type: RequestType<string, string, void> = new RequestType("vscode/content");
}

export async function activate(context: ExtensionContext) {
  const serverModule = Uri.joinPath(context.extensionUri, "dist/server/browser/main.js").toString();

  const worker = new Worker(serverModule);

  const newLanguageClient: LanguageClientConstructor = (id, name, clientOptions) => {
    return new LanguageClient(id, name, clientOptions, worker);
  };

  const onInitialize: onLanguageClientInitialize = (client) => {
    client.onRequest(VSCodeContentRequest.type, async (uri) => {
      try {
        const doc = await workspace.openTextDocument(Uri.parse(uri));
        return doc.getText();
      } catch (e: any) {
        return new ResponseError(2, e.toString());
      }
    });
  };

  client = await startClient(context, newLanguageClient, onInitialize);
}

export async function deactivate() {
  if (client) {
    await client.stop();
    client = null;
  }
}
