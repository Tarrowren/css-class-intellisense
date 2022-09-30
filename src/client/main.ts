import { join } from "path";
import { ExtensionContext } from "vscode";
import {
  BaseLanguageClient,
  ForkOptions,
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

let client: BaseLanguageClient | null | undefined;

export async function activate(context: ExtensionContext) {
  const serverModule = context.asAbsolutePath(join("out", "server", "main.js"));

  const debugOptions: ForkOptions = {
    execArgv: ["--nolazy", "--inspect=6009"],
  };

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: debugOptions,
    },
  };

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

  client = new LanguageClient(
    "cssClassIntellisense",
    "CSS Class Intellisense",
    serverOptions,
    clientOptions
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
