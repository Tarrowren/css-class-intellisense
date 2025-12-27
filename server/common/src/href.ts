import { DocumentUri, type Disposable } from "vscode-languageserver";
import { URI, Utils } from "vscode-uri";
import type { Configuration } from "./configuration";

export class Href implements Disposable {
  constructor(private readonly _configuration: Configuration) {}

  resolve(base: DocumentUri, ref: string): DocumentUri {
    if (ref.startsWith(".")) {
      return Utils.resolvePath(Utils.dirname(URI.parse(base)), ref).toString(true);
    } else if (ref.startsWith("/")) {
      // TODO support baseUrl
    } else if (ref.startsWith("http:") || ref.startsWith("https:")) {
      // TODO support http/https
    } else {
      // TODO support baseUrl & node_modules
    }

    logger.warn("can't resolve uri  " + ref);
    return ref;
  }

  dispose(): void {}
}
