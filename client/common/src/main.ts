import { CustomMessages, languages } from "shared";
import { CancellationTokenSource, Uri, window, workspace, type ExtensionContext, type LogOutputChannel } from "vscode";
import { type BaseLanguageClient, type LanguageClientOptions } from "vscode-languageclient";

export class Client {
  private _source: CancellationTokenSource | null | undefined;

  private constructor(
    private readonly _client: BaseLanguageClient,
    private readonly _context: ExtensionContext,
    private readonly _logger: LogOutputChannel,
  ) {}

  async start() {
    this._source = new CancellationTokenSource();
    await this._client.start();

    // readfile
    const encoder = new TextEncoder();
    this._context.subscriptions.push(
      this._client.onRequest(CustomMessages.FileRead, async (uri_string) => {
        const uri = Uri.parse(uri_string);

        if (uri.scheme === "vscode-notebook-cell") {
          try {
            const doc = await workspace.openTextDocument(uri);
            return Array.from(encoder.encode(doc.getText()));
          } catch (err) {
            this._logger.warn("read file fail", err);
            return [];
          }
        }

        if (workspace.fs.isWritableFileSystem(uri.scheme) === undefined) {
          return [];
        }

        try {
          return Array.from(await workspace.fs.readFile(uri));
        } catch (err) {
          this._logger.warn("read file fail", err);
          return [];
        }
      }),
    );

    // init
    const lang_pattern = `**/*.{${languages.join(",")}}`;
    const exclude = `{${[
      ...Object.keys(workspace.getConfiguration("search", null).get("exclude") ?? {}),
      ...Object.keys(workspace.getConfiguration("files", null).get("exclude") ?? {}),
    ].join(",")}}`;

    const all = await workspace.findFiles(lang_pattern, exclude, undefined, this._source.token);
    for (const uri of all) {
      this._logger.debug("find file", uri.toString());
    }
    await this._client.sendRequest(
      CustomMessages.QueueInit,
      all.map((uri) => uri.toString()),
      this._source.token,
    );
  }

  async stop() {
    if (this._source) {
      this._source.cancel();
      this._source = null;
    }
    await this._client.stop();
  }

  static create(factory: LanguageClientFactory, context: ExtensionContext) {
    const id = "css-class-intellisense";
    const name = "CSS Class Intellisense";
    const logger = window.createOutputChannel(name, { log: true });
    const client_options: LanguageClientOptions = {
      documentSelector: languages,
      outputChannel: logger,
    };

    return new Client(factory(id, name, client_options), context, logger);
  }
}

interface LanguageClientFactory {
  (id: string, name: string, client_options: LanguageClientOptions): BaseLanguageClient;
}
