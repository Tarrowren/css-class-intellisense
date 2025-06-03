import type { Tree } from "@lezer/common";
import type { LRParser } from "@lezer/lr";
import { languageConfigs } from "shared";
import type { Disposable, DocumentUri } from "vscode-languageserver";
import { URI, Utils } from "vscode-uri";
import type { Configuration } from "./configuration";
import type { CompletionTriggeredSymbolInfo } from "./features/common";
import CssLanguage from "./lang/css";
import HtmlLanguage from "./lang/html";
import SassLanguage from "./lang/sass";
import VueLanguage from "./lang/vue";
import type { SourceFile } from "./type";

export class Languages implements Disposable {
  private readonly _instances = new Map<string, Language | null>();

  constructor(private readonly _configuration: Configuration) {}

  getLanguageIdByUri(uri: DocumentUri): string {
    const suffix = Utils.extname(URI.parse(uri)).substring(1);

    for (const cfg of languageConfigs) {
      if (cfg.suffixes.includes(suffix)) {
        return cfg.languageId;
      }
    }

    return `unknown/${uri}`;
  }

  getLanguage(languageId: string): Language | null | undefined {
    if (this._instances.has(languageId)) {
      return this._instances.get(languageId);
    }

    const language = this._createInstance(languageId);
    this._instances.set(languageId, language);
    return language;
  }

  private _createInstance(languageId: string): Language | null {
    switch (languageId) {
      case "html":
        return new HtmlLanguage(this._configuration);
      // case "javascriptreact":
      //   break;
      // case "typescriptreact":
      //   break;
      case "vue":
        return new VueLanguage(this._configuration);
      // case "php":
      //   break;
      case "css":
        return new CssLanguage(this._configuration);
      case "scss":
        return new SassLanguage(this._configuration);
      case "sass":
        return new SassLanguage(this._configuration, true);
      // case "less":
      //   break;
      default:
        return null;
    }
  }

  dispose(): void {
    this._instances.clear();
  }
}

export interface Language {
  readonly parser: LRParser;

  getCompletionTriggeredSymbolInfo?(input: string, pos: number, tree: Tree): CompletionTriggeredSymbolInfo | undefined;
  query(uri: DocumentUri, input: string, tree: Tree): SourceFile;
}
