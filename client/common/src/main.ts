import { CustomMessages, languageConfigs, type InitOptions } from "@cci/shared";
import {
  CancellationTokenSource,
  RelativePattern,
  Uri,
  window,
  workspace,
  type CancellationToken,
  type ExtensionContext,
  type LogOutputChannel,
} from "vscode";
import type { BaseLanguageClient, LanguageClientOptions } from "vscode-languageclient";
import { getConfig, getProjectConfig, isNeedUpdateIndex } from "./config";

export class Client {
  private _config_update_source: CancellationTokenSource | null | undefined;
  private _index_update_source: CancellationTokenSource | null | undefined;
  private _need_update_index = false;

  private constructor(
    private readonly _client: BaseLanguageClient,
    private readonly _context: ExtensionContext,
    private readonly _logger: LogOutputChannel,
  ) {}

  async start(): Promise<void> {
    await this._client.start();

    // readfile
    this._context.subscriptions.push(
      this._client.onRequest(CustomMessages.FileRead, async (uri_string, token) => {
        const uri = Uri.parse(uri_string);
        let bytes: Uint8Array | undefined;
        try {
          bytes = await workspace.fs.readFile(uri);
        } catch (err) {
          this._logger.warn("[FileRead] FAILED", err);
        }
        if (token.isCancellationRequested) {
          throw new Error("cancelled");
        }
        return bytes ? Array.from(bytes) : [];
      }),
    );

    // init
    this._context.subscriptions.push(
      workspace.onDidChangeConfiguration((e) => {
        const folders = workspace.workspaceFolders;
        const index = !folders || folders.length === 0 || folders.some((folder) => isNeedUpdateIndex(e, folder));
        this._update(index);
      }),
    );
    this._context.subscriptions.push(
      workspace.onDidChangeWorkspaceFolders(() => {
        this._update(true);
      }),
    );
    this._update(true);
  }

  async stop(): Promise<void> {
    this._config_update_source?.cancel();
    this._config_update_source = null;

    this._index_update_source?.cancel();
    this._index_update_source = null;

    await this._client.stop();
  }

  private async _update(index_update: boolean) {
    this._config_update_source?.cancel();
    const config_source = (this._config_update_source = new CancellationTokenSource());

    let index_source = this._index_update_source;
    if (index_update) {
      this._need_update_index = true;

      this._index_update_source?.cancel();
      index_source = this._index_update_source = new CancellationTokenSource();
    }

    try {
      await this._config_update(config_source.token);
    } catch (err) {
      this._logger.error("[ConfigUpdate] FAILED", err);

      return;
    } finally {
      config_source.dispose();
      if (this._config_update_source === config_source) {
        this._config_update_source = null;
      }
    }

    if (this._need_update_index && index_source) {
      this._need_update_index = false;

      try {
        await this._index_update(index_source.token);
      } catch (err) {
        this._logger.error("[IndexUpdate] FAILED", err);

        return;
      } finally {
        index_source.dispose();
        if (this._index_update_source === index_source) {
          this._index_update_source = null;
        }
      }
    }
  }

  private async _config_update(token: CancellationToken) {
    const config = getConfig();

    await this._client.sendRequest(CustomMessages.ConfigUpdate, config, token);
  }

  private async _index_update(token: CancellationToken) {
    const uris = new Set<string>();

    const folders = workspace.workspaceFolders;
    if (folders && folders.length > 0) {
      for (const folder of folders) {
        const config = getProjectConfig(folder);

        const include =
          _concat_patterns(config.include) ?? `**/*.{${languageConfigs.flatMap((lang) => lang.suffixes).join(",")}}`;
        const exclude = _concat_patterns([
          ...Object.entries(workspace.getConfiguration().get<Record<string, boolean>>("search.exclude", {}))
            .filter(([_, v]) => v)
            .map(([k, _v]) => k),
          ...Object.entries(workspace.getConfiguration().get<Record<string, boolean>>("files.exclude", {}))
            .filter(([_, v]) => v)
            .map(([k, _v]) => k),
          ...config.exclude,
        ]);
        // TODO support .gitignore

        this._logger.info("[IndexUpdate] folder:", folder.name, "include:", include);
        this._logger.info("[IndexUpdate] folder:", folder.name, "exclude:", exclude);

        const files = await workspace.findFiles(
          new RelativePattern(folder, include),
          exclude ? new RelativePattern(folder, exclude) : null,
          undefined,
          token,
        );
        for (const uri of files) {
          uris.add(uri.toString(true));
        }
      }
    }

    for (const uri of uris) {
      this._logger.debug("[IndexUpdate] find file", uri);
    }

    await this._client.sendRequest(CustomMessages.IndexUpdate, [...uris], token);
  }

  static create(factory: LanguageClientFactory, context: ExtensionContext, initializationOptions: InitOptions): Client {
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

function _concat_patterns(patterns: ReadonlyArray<string>) {
  if (patterns.length > 1) {
    return `{${patterns.join(",")}}`;
  } else if (patterns.length === 1) {
    return patterns[0];
  } else {
    return null;
  }
}
