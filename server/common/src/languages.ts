import { languageConfigs } from "@cci/shared";
import type { Tree } from "@lezer/common";
import type { LRParser } from "@lezer/lr";
import type { Disposable, DocumentUri } from "vscode-languageserver";
import { URI, Utils } from "vscode-uri";
import type { Configuration } from "./configuration";
import type { CompletionTriggeredSymbolInfo } from "./features/common";
import CssLanguage from "./lang/css";
import HtmlLanguage from "./lang/html";
import JsxLanguage from "./lang/javascriptreact";
import LessLanguage from "./lang/less";
import PhpLanguage from "./lang/php";
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
    if (!this._configuration.vueLanguage && languageId === "vue") {
      return null;
    }

    if (this._instances.has(languageId)) {
      return this._instances.get(languageId);
    }

    const language = this._create_instance(languageId);
    this._instances.set(languageId, language);
    return language;
  }

  private _create_instance(languageId: string): Language | null {
    switch (languageId) {
      case "html":
        return new HtmlLanguage(this._configuration);
      case "javascriptreact":
        return new JsxLanguage(this._configuration);
      case "typescriptreact":
        return new JsxLanguage(this._configuration, true);
      case "vue":
        return new VueLanguage(this._configuration);
      case "php":
        return new PhpLanguage(this._configuration);
      case "css":
        return new CssLanguage(this._configuration);
      case "scss":
        return new SassLanguage(this._configuration);
      case "sass":
        return new SassLanguage(this._configuration, true);
      case "less":
        return new LessLanguage(this._configuration);
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

  completion?(input: string, pos: number, tree: Tree): CompletionTriggeredSymbolInfo | undefined;
  query(uri: DocumentUri, input: string, tree: Tree): SourceFile;
}
