import { ExtensionContext, Uri, workspace } from "vscode";
import { BaseLanguageClient, LanguageClientOptions, RequestType } from "vscode-languageclient";

export type LanguageClientConstructor = (
  id: string,
  name: string,
  clientOptions: LanguageClientOptions
) => BaseLanguageClient;

export type onLanguageClientInitialize = (client: BaseLanguageClient) => void;

namespace VSCodeRemoteFileRequest {
  export const type: RequestType<string, string, void> = new RequestType("vscode/remote-file");
}

export async function startClient(
  context: ExtensionContext,
  newLanguageClient: LanguageClientConstructor,
  onInitialize?: onLanguageClientInitialize
): Promise<BaseLanguageClient> {
  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      "css",
      // "scss",
      // "less",
      "html",
      // "vue",
      // "javascript",
      // "javascriptreact",
      // "typescript",
      // "typescriptreact",
    ],
  };

  const client = newLanguageClient("cssClassIntellisense", "CSS Class Intellisense", clientOptions);

  onInitialize?.(client);

  context.subscriptions.push(
    workspace.registerTextDocumentContentProvider("css-class-intellisense", {
      provideTextDocumentContent(uri, token) {
        return client.sendRequest(VSCodeRemoteFileRequest.type, Uri.parse(uri.path).toString(), token);
      },
    })
  );

  await client.start();

  return client;
}
