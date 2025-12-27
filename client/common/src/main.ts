import { CustomMessages, languageConfigs, type InitOptions } from "shared";
import { CancellationTokenSource, Uri, window, workspace, type ExtensionContext, type LogOutputChannel } from "vscode";
import { type BaseLanguageClient, type LanguageClientOptions } from "vscode-languageclient";

export class Client {
  private _source = new CancellationTokenSource();

  private constructor(
    private readonly _client: BaseLanguageClient,
    private readonly _context: ExtensionContext,
    private readonly _logger: LogOutputChannel,
  ) {}

  async start() {
    await this._client.start();

    // readfile
    this._context.subscriptions.push(
      this._client.onRequest(CustomMessages.FileRead, async (uri_string) => {
        const uri = Uri.parse(uri_string);
        return await this._fs_read(uri);
      }),
    );

    // init
    const include = `**/*.{${languageConfigs.flatMap((lang) => lang.suffixes).join(",")}}`;
    const exclude = `{${[
      ...Object.keys(workspace.getConfiguration("search").get("exclude", {})),
      ...Object.keys(workspace.getConfiguration("files").get("exclude", {})),
    ].join(",")}}`;
    // TODO support .gitignore

    this._logger.info("[Init Index] include:", include);
    this._logger.info("[Init Index] exclude:", exclude);

    const uris = await workspace.findFiles(include, exclude, undefined, this._source.token);
    const files = uris.map((uri) => {
      const file = uri.toString(true);
      this._logger.debug("[Init Index] find file", file);
      return file;
    });
    await this._client.sendRequest(CustomMessages.QueueInit, files, this._source.token);
  }

  async stop() {
    this._source.cancel();
    await this._client.stop();
  }

  private async _fs_read(uri: Uri): Promise<number[]> {
    try {
      return Array.from(await workspace.fs.readFile(uri));
    } catch (err) {
      this._logger.warn("[File Read] FAILED", err);
      return [];
    }
  }

  static create(factory: LanguageClientFactory, context: ExtensionContext, initializationOptions: InitOptions) {
    const id = "css-class-intellisense";
    const name = "CSS Class Intellisense";

    const lang_pattern = `**/*.{${languageConfigs.flatMap((lang) => lang.suffixes).join(",")}}`;
    const watcher = workspace.createFileSystemWatcher(lang_pattern);
    context.subscriptions.push(watcher);

    const client_options: LanguageClientOptions = {
      outputChannel: window.createOutputChannel(name + " Server", { log: true }),
      documentSelector: languageConfigs.map((lang) => lang.languageId),
      synchronize: { fileEvents: watcher },
      initializationOptions,
    };

    return new Client(
      factory(id, name, client_options),
      context,
      window.createOutputChannel(name + " Client", { log: true }),
    );
  }
}

interface LanguageClientFactory {
  (id: string, name: string, client_options: LanguageClientOptions): BaseLanguageClient;
}
