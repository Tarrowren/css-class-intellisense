import {
  CompletionItem,
  CompletionList,
  Disposable,
  Location,
  Position,
  ProviderResult,
  TextDocument,
  WorkspaceEdit,
} from "vscode";
import { LanguageModelCache } from "../caches/cache";
import { LanguageCacheEntry } from "../caches/language-caches";
import { Configuration } from "../config";
import { CssConfig } from "../css-config";
import { ReferenceMap } from "../reference-map";
import { CssMode } from "./css-mode";
import { HtmlMode } from "./html-mode";
import { JsxMode } from "./jsx-mode";
import { SassMode } from "./sass-mode";

export interface LanguageModes extends Disposable {
  getMode(languageId: string): LanguageMode | undefined;
  onDocumentRemoved(document: TextDocument): void;
}

export interface LanguageMode extends Disposable {
  doComplete?(document: TextDocument, position: Position): ProviderResult<CompletionItem[] | CompletionList>;
  findDefinition?(document: TextDocument, position: Position): ProviderResult<Location[]>;
  findReferences?(document: TextDocument, position: Position): ProviderResult<Location[]>;
  // prepareRename?: (document: TextDocument, position: Position) => ProviderResult<Range>;
  doRename?(document: TextDocument, position: Position, newName: string): ProviderResult<WorkspaceEdit>;
  onDocumentRemoved(document: TextDocument): void;
}

export class GlobalLanguageModes implements LanguageModes {
  private modes = new Map<string, LanguageMode>();

  constructor(
    config: Configuration,
    cache: LanguageModelCache<LanguageCacheEntry>,
    referenceMap: ReferenceMap,
    cssConfig: CssConfig
  ) {
    const h = new HtmlMode(config, cache, cssConfig);

    this.modes.set("html", h);
    this.modes.set("vue", h);
    this.modes.set("php", h);

    const j = new JsxMode(config, cache, cssConfig);

    this.modes.set("javascriptreact", j);
    this.modes.set("typescriptreact", j);

    this.modes.set("css", new CssMode(config, cache, referenceMap));

    this.modes.set("less", new CssMode(config, cache, referenceMap, true));

    const c = new SassMode(config, cache, referenceMap);
    this.modes.set("scss", c);
    this.modes.set("sass", c);
  }

  getMode(languageId: string): LanguageMode | undefined {
    return this.modes.get(languageId);
  }
  onDocumentRemoved(document: TextDocument): void {
    const mode = this.modes.get(document.languageId);

    if (!mode) {
      return;
    }

    mode.onDocumentRemoved(document);
  }
  dispose() {
    for (const mode of this.modes.values()) {
      mode.dispose();
    }
    this.modes.clear();
  }
}
