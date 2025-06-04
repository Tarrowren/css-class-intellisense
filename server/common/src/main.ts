import { CustomMessages } from "shared";
import { FileChangeType, TextDocumentSyncKind, type Connection, type InitializeResult } from "vscode-languageserver";
import { Configuration } from "./configuration";
import { DocumentStore } from "./document-store";
import { CompletionItemProvider } from "./features/completions";
import { DefinitionProvider } from "./features/definitions";
import { ReferenceProvider } from "./features/references";
import { RenameProvider } from "./features/renames";
import { Languages } from "./languages";
import { SymbolIndex } from "./symbol-index";
import { MemorySymbolStorage } from "./symbol-storage";
import { Trees } from "./trees";

export class Server {
  static create(connection: Connection) {
    const configuration = new Configuration(connection);
    const languages = new Languages(configuration);
    const documents = new DocumentStore(connection, languages);
    const trees = new Trees(documents);

    const storage = new MemorySymbolStorage();
    const symbols = new SymbolIndex(configuration, documents, languages, trees, storage);

    connection.onInitialize(() => {
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

    const completions = new CompletionItemProvider(languages, documents, trees, symbols);
    connection.onCompletion(async (params) => {
      return await completions.provideCompletionItems(params);
    });

    const definitions = new DefinitionProvider(configuration, languages, documents, trees, symbols);
    connection.onDefinition(async (params) => {
      return await definitions.provideDefinition(params);
    });

    const references = new ReferenceProvider(configuration, languages, documents, trees, symbols);
    connection.onReferences(async (params) => {
      return await references.provideReferences(params);
    });

    const renames = new RenameProvider(configuration, languages, documents, trees, symbols);
    connection.onPrepareRename(async (params) => {
      return await renames.prepareRename(params);
    });
    connection.onRenameRequest(async (params) => {
      return await renames.provideRenameEdits(params);
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

    connection.listen();
    connection.onExit(() => {
      symbols.dispose();
      storage.dispose();
      trees.dispose();
      documents.dispose();
      languages.dispose();
    });
  }
}
