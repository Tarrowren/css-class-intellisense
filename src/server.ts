import {
  CancellationTokenSource,
  CompletionItemProvider,
  DefinitionProvider,
  Disposable,
  ExtensionContext,
  languages,
  ReferenceProvider,
  workspace,
} from "vscode";
import { createLanguageCaches } from "./caches/language-caches";
import { CCI_HTTPS_SCHEME, CCI_HTTP_SCHEME, createHttpFileSystemProvider } from "./http-file-system";
import { createLanguageModes, LanguageModes } from "./modes/language-modes";
import { formatError, outputChannel, runSafeAsync, RuntimeEnvironment } from "./runner";

export function createLanguageServer(context: ExtensionContext, runtime: RuntimeEnvironment): LanguageServer {
  const languageCaches = createLanguageCaches(runtime);
  const languageModes = createLanguageModes(languageCaches);

  const fileSystemOptions = { isCaseSensitive: true, isReadonly: true };
  context.subscriptions.push(
    workspace.registerFileSystemProvider(CCI_HTTP_SCHEME, createHttpFileSystemProvider(runtime), fileSystemOptions),
    workspace.registerFileSystemProvider(CCI_HTTPS_SCHEME, createHttpFileSystemProvider(runtime), fileSystemOptions),
    languages.registerCompletionItemProvider(["html", "vue"], createCompletionItemProvider(runtime, languageModes)),
    languages.registerDefinitionProvider(["html", "vue"], createDefinitionProvider(runtime, languageModes)),
    languages.registerReferenceProvider(
      ["html", "vue", "css", "scss", "less"],
      createReferenceProvider(runtime, languageModes)
    )
  );

  const source = new CancellationTokenSource();

  (async () => {
    const uris = await workspace.findFiles("**/*.{html,vue}", undefined, undefined, source.token);
    if (uris.length > 0) {
      await Promise.all(
        uris.map(async (uri) => {
          const document = await workspace.openTextDocument(uri);
          const mode = languageModes.getMode(document.languageId);
          if (mode) {
          }
        })
      );
    }
  })().catch((e) => {
    outputChannel.appendLine(formatError("start", e));
  });

  return {
    dispose() {
      languageCaches.dispose();
      languageModes.dispose();
      source.cancel();
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
