import { ExtensionContext } from "vscode";
import { BaseLanguageClient, LanguageClientOptions } from "vscode-languageclient";

export type LanguageClientConstructor = (
  id: string,
  name: string,
  clientOptions: LanguageClientOptions
) => BaseLanguageClient;

export type onLanguageClientInitialize = (client: BaseLanguageClient) => void;

export async function startClient(
  _context: ExtensionContext,
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

  await client.start();

  return client;
}
