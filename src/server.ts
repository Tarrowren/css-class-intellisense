import {
  CompletionItemProvider,
  DefinitionProvider,
  Disposable,
  ExtensionContext,
  languages,
  ReferenceProvider,
  RenameProvider,
  workspace,
} from "vscode";
import { createLanguageModelCache } from "./caches/cache";
import { getLanguageCacheEntry } from "./caches/language-caches";
import { CCI_HTTPS_SCHEME, CCI_HTTP_SCHEME, createHttpFileSystemProvider } from "./http-file-system";
import { createLanguageModes, LanguageModes } from "./modes/language-modes";
import { createReferenceMap } from "./reference-map";
import { runSafeAsync, RuntimeEnvironment } from "./runner";

export function createLanguageServer(context: ExtensionContext, runtime: RuntimeEnvironment): LanguageServer {
  const languageCache = createLanguageModelCache(runtime, 10, 60, getLanguageCacheEntry);
  const referenceMap = createReferenceMap(runtime, languageCache);
  const languageModes = createLanguageModes(languageCache, referenceMap);

  const fileSystemOptions = { isCaseSensitive: true, isReadonly: true };
  context.subscriptions.push(
    workspace.registerFileSystemProvider(CCI_HTTP_SCHEME, createHttpFileSystemProvider(runtime), fileSystemOptions),
    workspace.registerFileSystemProvider(CCI_HTTPS_SCHEME, createHttpFileSystemProvider(runtime), fileSystemOptions),
    languages.registerCompletionItemProvider(
      ["html", "vue", "css", "scss", "less"],
      createCompletionItemProvider(runtime, languageModes)
    ),
    languages.registerDefinitionProvider(["html", "vue"], createDefinitionProvider(runtime, languageModes)),
    languages.registerReferenceProvider(
      ["html", "vue", "css", "scss", "less"],
      createReferenceProvider(runtime, languageModes)
    ),
    languages.registerRenameProvider(
      ["html", "vue", "css", "scss", "less"],
      createRenameProvider(runtime, languageModes)
    )
  );

  return {
    dispose() {
      languageCache.dispose();
      referenceMap.dispose();
      languageModes.dispose();
    },
  };
}

export interface LanguageServer extends Disposable {}

function createCompletionItemProvider(
  runtime: RuntimeEnvironment,
  languageModes: LanguageModes
): CompletionItemProvider {
  return {
    provideCompletionItems(document, position, token, _context) {
      return runSafeAsync(
        runtime,
        async () => {
          const mode = languageModes.getMode(document.languageId);
          if (!mode || !mode.doComplete) {
            return;
          }

          return await mode.doComplete(document, position);
        },
        null,
        "CompletionItemProvider",
        token
      );
    },
  };
}

function createDefinitionProvider(runtime: RuntimeEnvironment, languageModes: LanguageModes): DefinitionProvider {
  return {
    provideDefinition(document, position, token) {
      return runSafeAsync(
        runtime,
        async () => {
          const mode = languageModes.getMode(document.languageId);
          if (!mode || !mode.findDefinition) {
            return;
          }

          return await mode.findDefinition(document, position);
        },
        null,
        "DefinitionProvider",
        token
      );
    },
  };
}

function createReferenceProvider(runtime: RuntimeEnvironment, languageModes: LanguageModes): ReferenceProvider {
  return {
    provideReferences(document, position, _context, token) {
      return runSafeAsync(
        runtime,
        async () => {
          const mode = languageModes.getMode(document.languageId);
          if (!mode || !mode.findReferences) {
            return;
          }

          return await mode.findReferences(document, position);
        },
        null,
        "ReferenceProvider",
        token
      );
    },
  };
}

function createRenameProvider(runtime: RuntimeEnvironment, languageModes: LanguageModes): RenameProvider {
  return {
    // prepareRename(document, position, token) {
    //   return runSafeAsync(
    //     runtime,
    //     async () => {
    //       const mode = languageModes.getMode(document.languageId);
    //       if (!mode || !mode.prepareRename) {
    //         return;
    //       }

    //       return await mode.prepareRename(document, position);
    //     },
    //     null,
    //     "RenameProvider",
    //     token
    //   );
    // },
    provideRenameEdits(document, position, newName, token) {
      return runSafeAsync(
        runtime,
        async () => {
          const mode = languageModes.getMode(document.languageId);
          if (!mode || !mode.doRename) {
            return;
          }

          return await mode.doRename(document, position, newName);
        },
        null,
        "RenameProvider",
        token
      );
    },
  };
}
