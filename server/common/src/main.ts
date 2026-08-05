import { CustomMessages, type InitOptions } from "@cci/shared";
import * as l10n from "@vscode/l10n";
import typia from "typia";
import {
  FileChangeType,
  TextDocumentSyncKind,
  type CancellationToken,
  type Connection,
  type InitializeResult,
} from "vscode-languageserver";
import { URI } from "vscode-uri";
import { Configuration } from "./configuration";
import { DocumentStore } from "./document-store";
import { CompletionItemProvider } from "./features/completions";
import { DefinitionProvider } from "./features/definitions";
import { ReferenceProvider } from "./features/references";
import { RenameProvider } from "./features/renames";
import { Languages } from "./languages";
import { StopWatch } from "./stop-watch";
import { SymbolIndex } from "./symbol-index";
import type { SymbolStorage } from "./symbol-storage";
import { Trees } from "./trees";

export class Server {
  static create(connection: Connection, factory: StorageFactory): void {
    connection.onInitialize(async (params) => {
      const initializationOptions = typia.assert<InitOptions>(params.initializationOptions);

      if (initializationOptions.l10nLocation) {
        await l10n.config({ uri: initializationOptions.l10nLocation });
      }

      const configuration = new Configuration(connection);
      const storage = await factory.create(initializationOptions);

      const languages = new Languages(configuration);
      const documents = new DocumentStore(configuration, connection, languages);
      const trees = new Trees(documents);
      const symbols = new SymbolIndex(configuration, documents, languages, trees, storage);

      const completions = new CompletionItemProvider(languages, documents, trees, symbols);
      connection.onCompletion(async (params, token) => {
        const sw = StopWatch.create();
        try {
          return await run(() => completions.provideCompletionItems(params, token), null, token);
        } finally {
          console.info("[Completion]", token.isCancellationRequested ? "(cancelled)" : "(done)", sw.elapsed(2));
        }
      });

      const definitions = new DefinitionProvider(configuration, languages, documents, trees, symbols);
      connection.onDefinition(async (params, token) => {
        const sw = StopWatch.create();
        try {
          return await run(() => definitions.provideDefinition(params, token), null, token);
        } finally {
          console.info("[Definition]", token.isCancellationRequested ? "(cancelled)" : "(done)", sw.elapsed(2));
        }
      });

      const references = new ReferenceProvider(configuration, languages, documents, trees, symbols);
      connection.onReferences(async (params, token) => {
        const sw = StopWatch.create();
        try {
          return await run(() => references.provideReferences(params, token), null, token);
        } finally {
          console.info("[References]", token.isCancellationRequested ? "(cancelled)" : "(done)", sw.elapsed(2));
        }
      });

      const renames = new RenameProvider(configuration, languages, documents, trees, symbols);
      connection.onPrepareRename(async (params, token) => {
        const sw = StopWatch.create();
        try {
          return await run(() => renames.prepareRename(params), { defaultBehavior: true }, token);
        } finally {
          console.info("[PrepareRename]", token.isCancellationRequested ? "(cancelled)" : "(done)", sw.elapsed(2));
        }
      });
      connection.onRenameRequest(async (params, token) => {
        const sw = StopWatch.create();
        try {
          return await run(() => renames.provideRenameEdits(params, token), null, token);
        } finally {
          console.info("[Rename]", token.isCancellationRequested ? "(cancelled)" : "(done)", sw.elapsed(2));
        }
      });

      connection.onRequest(CustomMessages.IndexUpdate, async (uris) => {
        await symbols.initFiles(uris);
      });
      documents.onDidChangeContent(({ uri }) => {
        symbols.addFile(uri);
      });
      connection.onDidChangeWatchedFiles((e) => {
        for (const { type, uri: raw_uri } of e.changes) {
          const uri = URI.parse(raw_uri).toString(true);
          switch (type) {
            case FileChangeType.Created:
              symbols.addFile(uri);
              break;
            case FileChangeType.Deleted:
              documents.removeFile(uri);
              symbols.removeFile(uri);
              break;
            case FileChangeType.Changed:
              if (documents.removeFile(uri)) {
                symbols.addFile(uri);
              }
              break;
          }
        }
      });

      async function clear() {
        symbols.dispose();
        trees.dispose();
        documents.dispose();
        languages.dispose();

        await storage.close();
        configuration.dispose();
      }

      connection.onShutdown(clear);
      connection.onExit(clear);

      return {
        capabilities: {
          textDocumentSync: TextDocumentSyncKind.Incremental,
          completionProvider: {},
          definitionProvider: true,
          referencesProvider: true,
          renameProvider: { prepareProvider: true },
        },
      } satisfies InitializeResult;
    });

    connection.listen();
  }
}

export interface StorageFactory {
  create(options: InitOptions): Promise<SymbolStorage>;
}

async function run<T>(func: () => Promise<T>, defaultValue: T, token: CancellationToken): Promise<T> {
  try {
    await scheduler.wait(0, token);
  } catch (_e) {
    return defaultValue;
  }

  const result = await func();
  if (token.isCancellationRequested) {
    return defaultValue;
  }
  return result;
}
