import { CustomMessages, languageConfigs, LockType, ReadWriteLock, type InitOptions } from "@cci/shared";
import {
  CancellationTokenSource,
  RelativePattern,
  Uri,
  window,
  workspace,
  type ExtensionContext,
  type GlobPattern,
  type LogOutputChannel,
} from "vscode";
import { type BaseLanguageClient, type LanguageClientOptions } from "vscode-languageclient";
import { getConfig, getProjectConfig, isNeedUpdateIndex } from "./config";

export class Client {
  private readonly _source = new CancellationTokenSource();
  private readonly _index_lock = new ReadWriteLock();
  private _index_initing = false;

  private constructor(
    private readonly _client: BaseLanguageClient,
    private readonly _context: ExtensionContext,
    private readonly _logger: LogOutputChannel,
  ) {}

  async start(): Promise<void> {
    await this._client.start();

    // readfile
    this._context.subscriptions.push(
      this._client.onRequest(CustomMessages.FileRead, async (uri_string) => {
        const uri = Uri.parse(uri_string);
        return await this._fs_read(uri);
      }),
    );

    // init
    this._context.subscriptions.push(
      workspace.onDidChangeConfiguration(async (e) => {
        await this._updateConfig();

        const folders = workspace.workspaceFolders;
        if (folders && folders.length > 0 && folders.every((folder) => !isNeedUpdateIndex(e, folder))) {
          return;
        }
        await this._initIndex();
      }),
    );
    this._context.subscriptions.push(
      workspace.onDidChangeWorkspaceFolders(async () => {
        await this._updateConfig();
        await this._initIndex();
      }),
    );
    await this._updateConfig();
    await this._initIndex();
  }

  private async _updateConfig() {
    await this._client.sendRequest(CustomMessages.ConfigUpdate, getConfig(), this._source.token);
  }

  private async _initIndex() {
    if (this._index_initing) {
      return;
    }
    this._index_initing = true;
    const lk = this._index_lock.get(LockType.WRITE);
    await lk.lock();
    try {
      const uris = new Set<string>();

      const folders = workspace.workspaceFolders;
      if (folders && folders.length > 0) {
        const patterns: [GlobPattern, GlobPattern | null][] = [];
        for (const folder of folders) {
          const config = getProjectConfig(folder);

          const include =
            concat_patterns(config.include) ?? `**/*.{${languageConfigs.flatMap((lang) => lang.suffixes).join(",")}}`;
          const exclude = concat_patterns([
            ...Object.entries(workspace.getConfiguration().get<Record<string, boolean>>("search.exclude", {}))
              .filter(([_, v]) => v)
              .map(([k, _v]) => k),
            ...Object.entries(workspace.getConfiguration().get<Record<string, boolean>>("files.exclude", {}))
              .filter(([_, v]) => v)
              .map(([k, _v]) => k),
            ...config.exclude,
          ]);
          // TODO support .gitignore

          this._logger.info("[Init Index] folder:", folder.name, "include:", include);
          this._logger.info("[Init Index] folder:", folder.name, "exclude:", exclude);

          patterns.push([new RelativePattern(folder, include), exclude ? new RelativePattern(folder, exclude) : null]);
        }

        this._index_initing = false;

        for (const [include, exclude] of patterns) {
          const files = await workspace.findFiles(include, exclude, undefined, this._source.token);
          for (const file of files) {
            uris.add(file.toString(true));
          }
        }
      }

      for (const uri of uris) {
        this._logger.debug("[Init Index] find file", uri);
      }

      await this._client.sendRequest(CustomMessages.IndexUpdate, [...uris], this._source.token);
    } finally {
      lk.unlock();
    }
  }

  async stop(): Promise<void> {
    this._index_lock.dispose();
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

function concat_patterns(patterns: ReadonlyArray<string>) {
  if (patterns.length > 1) {
    return `{${patterns.join(",")}}`;
  } else if (patterns.length === 1) {
    return patterns[0];
  } else {
    return null;
  }
}
