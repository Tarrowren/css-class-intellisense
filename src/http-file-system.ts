import { Disposable, Event, EventEmitter, FileChangeEvent, FileStat, FileSystemProvider, FileType, Uri } from "vscode";
import { RuntimeEnvironment } from "./runner";

export const HTTP_SCHEME = "http";
export const HTTPS_SCHEME = "https";
export const CSSCI_HTTP_SCHEME = "cssci-http";
export const CSSCI_HTTPS_SCHEME = "cssci-https";

export class HttpFileSystemProvider implements FileSystemProvider {
  private _runtime: RuntimeEnvironment;
  private _onDidChangeFile: EventEmitter<FileChangeEvent[]>;

  constructor(runtime: RuntimeEnvironment) {
    this._runtime = runtime;
    this._onDidChangeFile = new EventEmitter<FileChangeEvent[]>();
  }

  get onDidChangeFile(): Event<FileChangeEvent[]> {
    return this._onDidChangeFile.event;
  }

  watch(_uri: Uri, _options: { readonly recursive: boolean; readonly excludes: readonly string[] }): Disposable {
    return new Disposable(() => null);
  }

  async stat(uri: Uri): Promise<FileStat> {
    return await this._runtime.request.stat(uri);
  }

  async readFile(uri: Uri): Promise<Uint8Array> {
    return await this._runtime.request.readFile(uri);
  }

  readDirectory(_uri: Uri): [string, FileType][] | Thenable<[string, FileType][]> {
    throw new Error("Method not implemented.");
  }

  createDirectory(_uri: Uri): void | Thenable<void> {
    throw new Error("Method not implemented.");
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

export function convertToHttpScheme(uri: Uri): Uri {
  if (uri.scheme === HTTP_SCHEME || uri.scheme === HTTPS_SCHEME) {
    return uri;
  } else if (uri.scheme === CSSCI_HTTP_SCHEME) {
    return uri.with({ scheme: HTTP_SCHEME });
  } else if (uri.scheme === CSSCI_HTTPS_SCHEME) {
    return uri.with({ scheme: HTTPS_SCHEME });
  } else {
    throw new Error(`Unable to convert ${uri.toString(true)}`);
  }
}

export function convertToHttpSchemeEx(uri: Uri): Uri {
  if (uri.scheme === CSSCI_HTTP_SCHEME || uri.scheme === CSSCI_HTTPS_SCHEME) {
    return uri;
  } else if (uri.scheme === HTTP_SCHEME) {
    return uri.with({ scheme: CSSCI_HTTP_SCHEME });
  } else if (uri.scheme === HTTPS_SCHEME) {
    return uri.with({ scheme: CSSCI_HTTPS_SCHEME });
  } else {
    throw new Error(`Unable to convert ${uri.toString(true)}`);
  }
}
