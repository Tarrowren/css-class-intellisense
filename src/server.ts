import {
  CompletionItemProvider,
  DefinitionProvider,
  Disposable,
  ExtensionContext,
  languages,
  ReferenceProvider,
  workspace,
} from "vscode";
import { CCI_HTTPS_SCHEME, CCI_HTTP_SCHEME, createHttpFileSystemProvider } from "./file-system";
import { createLanguageModes, LanguageModes } from "./modes/language-modes";
import { runSafeAsync, RuntimeEnvironment } from "./runner";

export function createLanguageServer(context: ExtensionContext, runtime: RuntimeEnvironment): LanguageServer {
  const languageModes = createLanguageModes(runtime);
  const fileSystemProvider = createHttpFileSystemProvider(runtime);

  context.subscriptions.push(
    workspace.registerFileSystemProvider(CCI_HTTP_SCHEME, fileSystemProvider, {
      isCaseSensitive: true,
      isReadonly: true,
    }),
    workspace.registerFileSystemProvider(CCI_HTTPS_SCHEME, fileSystemProvider, {
      isCaseSensitive: true,
      isReadonly: true,
    }),
    languages.registerCompletionItemProvider(["html", "vue"], createCompletionItemProvider(runtime, languageModes)),
    languages.registerDefinitionProvider(["html", "vue"], createDefinitionProvider()),
    languages.registerReferenceProvider(["html", "vue", "css", "scss", "less"], createReferenceProvider())
  );

  return {
    dispose() {
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

function createDefinitionProvider(): DefinitionProvider {
  return {
    provideDefinition(document, position, token) {
      throw new Error("Method not implemented.");
    },
  };
}

function createReferenceProvider(): ReferenceProvider {
  return {
    provideReferences(document, position, context, token) {
      throw new Error("Method not implemented.");
    },
  };
}
