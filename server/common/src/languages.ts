import type { Tree } from "@lezer/common";
import type { LRParser } from "@lezer/lr";
import { languageConfigs, type LanguageConfig } from "shared";
import type { Disposable, DocumentUri } from "vscode-languageserver";
import type { CompletionTriggeredSymbolInfo } from "./features/common";
import HtmlLanguage from "./lang/html";
import type { SourceFile } from "./type";

interface _LanguageConfig extends LanguageConfig {
  load(): Language | undefined;
}

export class Languages implements Disposable {
  private readonly _instances = new Map<string, Language>();
  private readonly _configuration: ReadonlyArray<_LanguageConfig> = languageConfigs.map<_LanguageConfig>((lang) => {
    return {
      ...lang,
      load() {
        switch (lang.languageId) {
          case "html":
            return new HtmlLanguage();
          // case "javascriptreact":
          //   break;
          // case "typescriptreact":
          //   break;
          // case "vue":
          //   break;
          // case "php":
          //   break;
          // case "css":
          //   break;
          // case "scss":
          //   break;
          // case "sass":
          //   break;
          // case "less":
          //   break;
          default:
            return;
        }
      },
    };
  });

  getLanguageIdByUri(uri: DocumentUri): string {
    let end = uri.lastIndexOf("?");
    if (end < 0) {
      end = uri.lastIndexOf("#");
    }
    if (end > 0) {
      uri = uri.substring(0, end);
    }
    const start = uri.lastIndexOf(".");
    const suffix = uri.substring(start + 1);

    for (const cfg of this._configuration) {
      if (cfg.suffixes.includes(suffix)) {
        return cfg.languageId;
      }
    }

    return `unknown/${uri}`;
  }

  getLanguage(languageId: string): Language | undefined {
    let language = this._instances.get(languageId);
    if (!language) {
      for (const cfg of this._configuration) {
        if (cfg.languageId === languageId) {
          language = cfg.load();
          if (language) {
            this._instances.set(languageId, language);
          }
          break;
        }
      }
    }

    return language;
  }

  dispose(): void {
    this._instances.clear();
  }
}

export interface Language {
  readonly parser: LRParser;

  getCompletionTriggeredSymbolInfo(input: string, pos: number, tree: Tree): CompletionTriggeredSymbolInfo | undefined;
  query(input: string, tree: Tree): SourceFile;
}
