import { EventEmitter, FileChangeEvent, FileSystemProvider, Uri } from "vscode";
import { EmptyDisposable, RuntimeEnvironment } from "./runner";

export const CCI_HTTP_SCHEME = "ccihttp";
export const CCI_HTTPS_SCHEME = "ccihttps";

export function createHttpFileSystemProvider(runtime: RuntimeEnvironment): FileSystemProvider {
  const _onDidChangeFile = new EventEmitter<FileChangeEvent[]>();

  return {
    get onDidChangeFile() {
      return _onDidChangeFile.event;
    },
    async readFile(uri) {
      return await runtime.request.readFile(uri);
    },
    async stat(uri) {
      return await runtime.request.stat(uri);
    },
    watch(_uri, _options) {
      return EmptyDisposable;
    },
    createDirectory(_uri) {
      throw new Error("Method not implemented.");
    },
    delete(_uri, _options) {
      throw new Error("Method not implemented.");
    },
    readDirectory(_uri) {
      throw new Error("Method not implemented.");
    },
    rename(_oldUri, _newUri, _options) {
      throw new Error("Method not implemented.");
    },
    writeFile(_uri, _content, _options) {
      throw new Error("Method not implemented.");
    },
  };
}

export function convertToHttpScheme(uri: Uri): Uri {
  if (uri.scheme === "http" || uri.scheme === "https") {
    return uri;
  } else if (uri.scheme === CCI_HTTP_SCHEME) {
    return uri.with({ scheme: "http" });
  } else if (uri.scheme === CCI_HTTPS_SCHEME) {
    return uri.with({ scheme: "https" });
  } else {
    throw new Error(`Unable to convert ${uri.toString(true)}`);
  }
}
