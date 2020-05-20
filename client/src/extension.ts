import * as path from "path";
import { ExtensionContext } from "vscode";
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind,
} from "vscode-languageclient";

export function activate(context: ExtensionContext) {
    const serverModule = context.asAbsolutePath(
        path.join("server", "out", "server.js")
    );
    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: {
            module: serverModule,
            transport: TransportKind.ipc,
            options: { execArgv: ["--nolazy", "--inspect=6009"] },
        },
    };

    const clientOptions: LanguageClientOptions = {
        documentSelector: [
            { scheme: "file", language: "html" },
            { scheme: "file", language: "css" },
        ],
    };
    const client = new LanguageClient(
        "cssClassIntellisense",
        "CSS Class Intellisense",
        serverOptions,
        clientOptions
    );

    context.subscriptions.push(client.start());
}
