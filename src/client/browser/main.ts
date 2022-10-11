import { ExtensionContext, Uri, workspace } from "vscode";
import {
  BaseLanguageClient,
  LanguageClient,
  RequestType,
  ResponseError,
} from "vscode-languageclient/browser";
import { startClient } from "../client";

declare const Worker: {
  new (stringUrl: string): any;
};

declare function fetch(uri: string, options: any): any;

let client: BaseLanguageClient | null | undefined;

namespace VSCodeContentRequest {
  export const file_content: RequestType<string, string, any> = new RequestType(
    "vscode/file-content"
  );
  export const http_content: RequestType<string, string, any> = new RequestType(
    "vscode/http-content"
  );
}

export async function activate(context: ExtensionContext) {
  const serverModule = Uri.joinPath(
    context.extensionUri,
    "dist/server/browser/main.js"
  ).toString();

  const worker = new Worker(serverModule);

  client = await startClient(
    context,
    (id, name, clientOptions) => {
      return new LanguageClient(id, name, clientOptions, worker);
    },
    (client) => {
      client.onRequest(VSCodeContentRequest.file_content, async (uri) => {
        try {
          const doc = await workspace.openTextDocument(Uri.parse(uri));
          return doc.getText();
        } catch (e: any) {
          return new ResponseError(1, e.toString());
        }
      });
      client.onRequest(VSCodeContentRequest.http_content, async (url) => {
        try {
          const resp = await fetch(url, { mode: "cors" });
          return await resp.text();
        } catch (e: any) {
          return new ResponseError(2, e.toString());
        }
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
