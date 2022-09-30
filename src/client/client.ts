import { ExtensionContext, Uri, workspace } from "vscode";
import {
  BaseLanguageClient,
  LanguageClientOptions,
  RequestType,
  ResponseError,
} from "vscode-languageclient";
import { Runtime } from "./runner";

namespace VSCodeContentRequest {
  export const type: RequestType<string, string, any> = new RequestType(
    "vscode/content"
  );
}

export type LanguageClientConstructor = (
  id: string,
  name: string,
  clientOptions: LanguageClientOptions
) => BaseLanguageClient;

export async function startClient(
  _context: ExtensionContext,
  newLanguageClient: LanguageClientConstructor,
  runtime: Runtime
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

  const client = newLanguageClient(
    "cssClassIntellisense",
    "CSS Class Intellisense",
    clientOptions
  );

  client.onRequest(VSCodeContentRequest.type, async (params) => {
    const uri = Uri.parse(params);

    if (uri.scheme === "untitled") {
      return new ResponseError(3, `Unable to load ${uri.toString()}`);
    }

    if (uri.scheme === "http" || uri.scheme === "https") {
      try {
        return runtime.request.getContent(params);
      } catch (e: any) {
        return new ResponseError(4, e.toString());
      }
    } else {
      try {
        const doc = await workspace.openTextDocument(uri);
        return doc.getText();
      } catch (e: any) {
        return new ResponseError(2, e.toString());
      }
    }
  });

  await client.start();

  return client;
}
