import {
  CancellationToken,
  commands,
  CompletionContext,
  CompletionItem,
  CompletionItemProvider,
  CompletionList,
  Definition,
  DefinitionProvider,
  Disposable,
  ExtensionContext,
  l10n,
  languages,
  Location,
  LocationLink,
  Position,
  ProviderResult,
  ReferenceContext,
  ReferenceProvider,
  RenameProvider,
  TextDocument,
  window,
  workspace,
  WorkspaceEdit,
} from "vscode";
import { GlobalLanguageModelCache, LanguageModelCache } from "./caches/cache";
import { getLanguageCacheEntry, LanguageCacheEntry } from "./caches/language-caches";
import { Configuration } from "./config";
import { createCssConfig, CssConfig } from "./css-config";
import { CSSCI_HTTP_SCHEME, CSSCI_HTTPS_SCHEME, HttpFileSystemProvider } from "./http-file-system";
import { GlobalLanguageModes, LanguageModes } from "./modes/language-modes";
import { GlobalReferenceMap, ReferenceMap } from "./reference-map";
import { runSafeAsync, RuntimeEnvironment } from "./runner";

export interface LanguageServer extends Disposable {}

export class GlobalLanguageServer implements LanguageServer {
  private config: Configuration;
  private cssConfig: CssConfig;
  private languageCache: LanguageModelCache<LanguageCacheEntry>;
  private referenceMap: ReferenceMap;
  private languageModes: LanguageModes;

  constructor(context: ExtensionContext, runtime: RuntimeEnvironment) {
    this.config = new Configuration();
    this.cssConfig = createCssConfig(runtime);
    this.languageCache = new GlobalLanguageModelCache(runtime, 10, 60, (document) => getLanguageCacheEntry(document));
    this.referenceMap = new GlobalReferenceMap(runtime, this.config, this.languageCache, this.cssConfig);
    this.languageModes = new GlobalLanguageModes(this.config, this.languageCache, this.referenceMap, this.cssConfig);

    const htmlLanguages = ["html", "vue", "javascriptreact", "typescriptreact", "php"];
    const cssLanguages = ["css", "scss", "sass", "less"];
    const allLanguages = [...htmlLanguages, ...cssLanguages];

    const fileSystemOptions = { isCaseSensitive: true, isReadonly: true };
    context.subscriptions.push(
      workspace.registerFileSystemProvider(CSSCI_HTTP_SCHEME, new HttpFileSystemProvider(runtime), fileSystemOptions),
      workspace.registerFileSystemProvider(CSSCI_HTTPS_SCHEME, new HttpFileSystemProvider(runtime), fileSystemOptions),
      languages.registerCompletionItemProvider(
        allLanguages,
        new CssCompletionItemProvider(runtime, this.languageModes)
      ),
      languages.registerDefinitionProvider(htmlLanguages, new CssDefinitionProvider(runtime, this.languageModes)),
      languages.registerReferenceProvider(allLanguages, new CssReferenceProvider(runtime, this.languageModes)),
      languages.registerRenameProvider(allLanguages, new CssRenameProvider(runtime, this.languageModes)),
      commands.registerCommand("cssci.clearCache", async () => {
        if (runtime.request.clearCache) {
          await runtime.request.clearCache();
          await window.showInformationMessage(l10n.t("Cache cleaned up."));
        }
      })
    );
  }

  dispose() {
    this.config.dispose();
    this.cssConfig.dispose();
    this.languageCache.dispose();
    this.referenceMap.dispose();
    this.languageModes.dispose();
  }
}

class CssCompletionItemProvider implements CompletionItemProvider {
  constructor(private runtime: RuntimeEnvironment, private languageModes: LanguageModes) {}

  provideCompletionItems(
    document: TextDocument,
    position: Position,
    token: CancellationToken,
    _context: CompletionContext
  ): ProviderResult<CompletionItem[] | CompletionList<CompletionItem>> {
    return runSafeAsync(
      this.runtime,
      async () => {
        const mode = this.languageModes.getMode(document.languageId);
        if (!mode || !mode.doComplete) {
          return;
        }

        return await mode.doComplete(document, position);
      },
      null,
      "completion item provider",
      token
    );
  }
}

class CssDefinitionProvider implements DefinitionProvider {
  constructor(private runtime: RuntimeEnvironment, private languageModes: LanguageModes) {}

  provideDefinition(
    document: TextDocument,
    position: Position,
    token: CancellationToken
  ): ProviderResult<Definition | LocationLink[]> {
    return runSafeAsync(
      this.runtime,
      async () => {
        const mode = this.languageModes.getMode(document.languageId);
        if (!mode || !mode.findDefinition) {
          return;
        }

        return await mode.findDefinition(document, position);
      },
      null,
      "definition provider",
      token
    );
  }
}

class CssReferenceProvider implements ReferenceProvider {
  constructor(private runtime: RuntimeEnvironment, private languageModes: LanguageModes) {}

  provideReferences(
    document: TextDocument,
    position: Position,
    _context: ReferenceContext,
    token: CancellationToken
  ): ProviderResult<Location[]> {
    return runSafeAsync(
      this.runtime,
      async () => {
        const mode = this.languageModes.getMode(document.languageId);
        if (!mode || !mode.findReferences) {
          return;
        }

        return await mode.findReferences(document, position);
      },
      null,
      "reference provider",
      token
    );
  }
}

class CssRenameProvider implements RenameProvider {
  constructor(private runtime: RuntimeEnvironment, private languageModes: LanguageModes) {}

  provideRenameEdits(
    document: TextDocument,
    position: Position,
    newName: string,
    token: CancellationToken
  ): ProviderResult<WorkspaceEdit> {
    return runSafeAsync(
      this.runtime,
      async () => {
        const mode = this.languageModes.getMode(document.languageId);
        if (!mode || !mode.doRename) {
          return;
        }

        return await mode.doRename(document, position, newName);
      },
      null,
      "rename provider",
      token
    );
  }

  // prepareRename?(
  //   document: TextDocument,
  //   position: Position,
  //   token: CancellationToken
  // ): ProviderResult<Range | { range: Range; placeholder: string }> {
  //   throw new Error("Method not implemented.");
  // }
}
