import type { Tree } from "@lezer/common";
import type { LRParser } from "@lezer/lr";
import { languageConfigs } from "shared";
import type { Disposable, DocumentUri } from "vscode-languageserver";
import { URI, Utils } from "vscode-uri";
import type { Configuration } from "./configuration";
import type { CompletionTriggeredSymbolInfo } from "./features/common";
import { Href } from "./href";
import CssLanguage from "./lang/css";
import HtmlLanguage from "./lang/html";
import JsxLanguage from "./lang/javascriptreact";
import PhpLanguage from "./lang/php";
import SassLanguage from "./lang/sass";
import VueLanguage from "./lang/vue";
import type { SourceFile } from "./type";

export class Languages implements Disposable {
  private readonly _instances = new Map<string, Language | null>();
  private readonly _href: Href;

  constructor(private readonly _configuration: Configuration) {
    this._href = new Href(_configuration);
  }

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
        return new HtmlLanguage(this._href);
      case "javascriptreact":
        return new JsxLanguage(this._href);
      case "typescriptreact":
        return new JsxLanguage(this._href, true);
      case "vue":
        return new VueLanguage(this._href);
      case "php":
        return new PhpLanguage(this._href);
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
