import { CustomMessages, languageConfigs, type InitOptions } from "@cci/shared";
import {
  CancellationError,
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
  private _configUpdateSource: CancellationTokenSource | null | undefined;
  private _indexUpdateSource: CancellationTokenSource | null | undefined;
  private _needUpdateIndex = false;

  private constructor(
    private readonly _client: BaseLanguageClient,
    private readonly _context: ExtensionContext,
    private readonly _logger: LogOutputChannel,
  ) {}

  async start(): Promise<void> {
    await this._client.start();

    // readfile
    this._context.subscriptions.push(
      this._client.onRequest(CustomMessages.FileRead, async (uriString, token) => {
        const uri = Uri.parse(uriString);
        let bytes: Uint8Array | undefined;
        try {
          bytes = await workspace.fs.readFile(uri);
        } catch (err) {
          this._logger.warn("[FileRead] FAILED", err);
        }
        if (token.isCancellationRequested) {
          throw new CancellationError();
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
    this._configUpdateSource?.cancel();
    this._configUpdateSource = null;

    this._indexUpdateSource?.cancel();
    this._indexUpdateSource = null;

    await this._client.stop();
  }

  private async _update(indexUpdate: boolean) {
    this._configUpdateSource?.cancel();
    const configSource = (this._configUpdateSource = new CancellationTokenSource());

    let indexSource = this._indexUpdateSource;
    if (indexUpdate) {
      this._needUpdateIndex = true;

      this._indexUpdateSource?.cancel();
      indexSource = this._indexUpdateSource = new CancellationTokenSource();
    }

    try {
      await this._configUpdate(configSource.token);
    } catch (err) {
      this._logger.error("[ConfigUpdate] FAILED", err);

      return;
    } finally {
      configSource.dispose();
      if (this._configUpdateSource === configSource) {
        this._configUpdateSource = null;
      }
    }

    if (this._needUpdateIndex && indexSource) {
      this._needUpdateIndex = false;

      try {
        await this._indexUpdate(indexSource.token);
      } catch (err) {
        this._logger.error("[IndexUpdate] FAILED", err);

        return;
      } finally {
        indexSource.dispose();
        if (this._indexUpdateSource === indexSource) {
          this._indexUpdateSource = null;
        }
      }
    }
  }

  private async _configUpdate(token: CancellationToken) {
    const config = getConfig();

    await this._client.sendRequest(CustomMessages.ConfigUpdate, config, token);
  }

  private async _indexUpdate(token: CancellationToken) {
    const uris = new Set<string>();

    const folders = workspace.workspaceFolders;
    if (folders && folders.length > 0) {
      for (const folder of folders) {
        const config = getProjectConfig(folder);

        const include =
          _concatPatterns(config.include) ?? `**/*.{${languageConfigs.flatMap((lang) => lang.suffixes).join(",")}}`;
        const exclude = _concatPatterns([
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

    const langPattern = `**/*.{${languageConfigs.flatMap((lang) => lang.suffixes).join(",")}}`;
    const watcher = workspace.createFileSystemWatcher(langPattern);
    context.subscriptions.push(watcher);

    const clientOptions: LanguageClientOptions = {
      outputChannel: window.createOutputChannel(name + " Server", { log: true }),
      documentSelector: languageConfigs.map((lang) => lang.languageId),
      synchronize: { fileEvents: watcher },
      initializationOptions,
    };

    return new Client(
      factory(id, name, clientOptions),
      context,
      window.createOutputChannel(name + " Client", { log: true }),
    );
  }
}

interface LanguageClientFactory {
  (id: string, name: string, clientOptions: LanguageClientOptions): BaseLanguageClient;
}

function _concatPatterns(patterns: ReadonlyArray<string>) {
  if (patterns.length > 1) {
    return `{${patterns.join(",")}}`;
  } else if (patterns.length === 1) {
    return patterns[0];
  } else {
    return null;
  }
}
