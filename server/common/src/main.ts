import { CustomMessages, type InitOptions } from "shared";
import typia from "typia";
import {
  FileChangeType,
  TextDocumentSyncKind,
  type CancellationToken,
  type Connection,
  type InitializeResult,
} from "vscode-languageserver";
import { Configuration } from "./configuration";
import { DocumentStore } from "./document-store";
import { CompletionItemProvider } from "./features/completions";
import { DefinitionProvider } from "./features/definitions";
import { ReferenceProvider } from "./features/references";
import { RenameProvider } from "./features/renames";
import { Languages } from "./languages";
import { SymbolIndex } from "./symbol-index";
import type { SymbolStorage } from "./symbol-storage";
import { Trees } from "./trees";
export * from "./logger";

export class Server {
  static create(connection: Connection, factory: StorageFactory) {
    connection.onInitialize(async (params) => {
      const initializationOptions = typia.assert<InitOptions>(params.initializationOptions);

      const configuration = new Configuration(connection);
      const storage = await factory.create(initializationOptions);

      const languages = new Languages(configuration);
      const documents = new DocumentStore(connection, languages);
      const trees = new Trees(documents);
      const symbols = new SymbolIndex(configuration, documents, languages, trees, storage);

      const completions = new CompletionItemProvider(languages, documents, trees, symbols);
      connection.onCompletion(async (params, token) => {
        return await run(() => completions.provideCompletionItems(params), null, token);
      });

      const definitions = new DefinitionProvider(configuration, languages, documents, trees, symbols);
      connection.onDefinition(async (params, token) => {
        return await run(() => definitions.provideDefinition(params), null, token);
      });

      const references = new ReferenceProvider(configuration, languages, documents, trees, symbols);
      connection.onReferences(async (params, token) => {
        return await run(() => references.provideReferences(params), null, token);
      });

      const renames = new RenameProvider(configuration, languages, documents, trees, symbols);
      connection.onPrepareRename(async (params, token) => {
        return await run(() => renames.prepareRename(params), { defaultBehavior: true }, token);
      });
      connection.onRenameRequest(async (params, token) => {
        return await run(() => renames.provideRenameEdits(params), null, token);
      });

      connection.onRequest(CustomMessages.QueueInit, async (uris) => {
        await symbols.initFiles(uris);
      });
      documents.onDidChangeContent(({ uri }) => {
        symbols.addFile(uri);
      });
      connection.onDidChangeWatchedFiles((e) => {
        for (const { type, uri } of e.changes) {
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

      connection.onExit(() => {
        symbols.dispose();
        trees.dispose();
        documents.dispose();
        languages.dispose();

        storage.dispose();
        configuration.dispose();
      });

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
