import { Disposable, type Connection, type DocumentUri } from "vscode-languageserver";
import { URI, Utils } from "vscode-uri";

export class Configuration implements Disposable {
  readonly parallel: number = concurrency;
  constructor(private readonly _connection: Connection) {}

  resolve(base: DocumentUri, ref: string): DocumentUri {
    if (ref.startsWith(".")) {
      return Utils.resolvePath(Utils.dirname(URI.parse(base)), ref).toString();
    } else if (ref.startsWith("/")) {
      // TODO support baseUrl
    } else if (ref.startsWith("http")) {
      // TODO support http/https
    } else {
      // TODO support baseUrl & node_modules
    }

    logger.warn("can't resolve uri  " + ref);
    return ref;
  }

  dispose(): void {}
}
