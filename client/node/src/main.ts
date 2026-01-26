import { Client } from "client-common";
import {
  Disposable,
  EventEmitter,
  FilePermission,
  FileType,
  Uri,
  workspace,
  type Event,
  type ExtensionContext,
  type FileChangeEvent,
  type FileStat,
  type FileSystemProvider,
} from "vscode";
import { LanguageClient, TransportKind, type ServerOptions } from "vscode-languageclient/node";

let client: Client | null | undefined;

export async function activate(context: ExtensionContext) {
  const server = Uri.joinPath(context.extensionUri, "dist/node/server.cjs").fsPath;

  const fsProvider = new HttpFileSystemProvider();
  const fsProviderOptions = {
    isCaseSensitive: true,
    isReadonly: true,
  };

  context.subscriptions.push(
    workspace.registerFileSystemProvider("http", fsProvider, fsProviderOptions),
    workspace.registerFileSystemProvider("https", fsProvider, fsProviderOptions),
  );

  client = Client.create(
    (id, name, clientOptions) => {
      const serverOptions: ServerOptions = { module: server, transport: TransportKind.ipc };
      return new LanguageClient(id, name, serverOptions, clientOptions);
    },
    context,
    { databaseName: "symbols", storagePath: context.storageUri?.fsPath },
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

class HttpFileSystemProvider implements FileSystemProvider {
  private readonly _onDidChangeFile = new EventEmitter<FileChangeEvent[]>();

  get onDidChangeFile(): Event<FileChangeEvent[]> {
    return this._onDidChangeFile.event;
  }

  watch(_uri: Uri, _options: { readonly recursive: boolean; readonly excludes: readonly string[] }): Disposable {
    return Disposable.from();
  }

  async stat(uri: Uri): Promise<FileStat> {
    const response = await fetch(uri.toString(true));
    if (!response.ok) {
      throw new Error(response.statusText);
    }

    const contentLength = response.headers.get("content-length");
    return {
      type: FileType.File,
      ctime: 0,
      mtime: 0,
      size: contentLength ? Number.parseInt(contentLength) : 0,
      permissions: FilePermission.Readonly,
    };
  }

  readDirectory(_uri: Uri): [string, FileType][] | Thenable<[string, FileType][]> {
    throw new Error("Method not implemented.");
  }

  createDirectory(_uri: Uri): void | Thenable<void> {
    throw new Error("Method not implemented.");
  }

  async readFile(uri: Uri): Promise<Uint8Array> {
    const response = await fetch(uri.toString(true));
    if (!response.ok) {
      throw new Error(response.statusText);
    }

    const buf = await response.arrayBuffer();
    return new Uint8Array(buf);
  }

  writeFile(
    _uri: Uri,
    _content: Uint8Array,
    _options: { readonly create: boolean; readonly overwrite: boolean },
  ): void | Thenable<void> {
    throw new Error("Method not implemented.");
  }

  delete(_uri: Uri, _options: { readonly recursive: boolean }): void | Thenable<void> {
    throw new Error("Method not implemented.");
  }

  rename(_oldUri: Uri, _newUri: Uri, _options: { readonly overwrite: boolean }): void | Thenable<void> {
    throw new Error("Method not implemented.");
  }
}
