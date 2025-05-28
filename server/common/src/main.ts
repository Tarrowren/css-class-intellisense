import { CustomMessages } from "shared";
import { FileChangeType, TextDocumentSyncKind, type Connection, type InitializeResult } from "vscode-languageserver";
import { DocumentStore } from "./document-store";
import { CompletionItemProvider } from "./features/completions";
import { DefinitionProvider } from "./features/definitions";
import { Languages } from "./languages";
import { SymbolIndex } from "./symbol-index";
import { MemorySymbolStorage } from "./symbol-storage";
import { Trees } from "./trees";

export class Server {
  static create(connection: Connection) {
    const languages = new Languages();
    const documents = new DocumentStore(connection, languages);
    const trees = new Trees(documents);

    const storage = new MemorySymbolStorage();
    const symbols = new SymbolIndex(documents, languages, trees, storage);

    connection.onInitialize(() => {
      return {
        capabilities: {
          textDocumentSync: TextDocumentSyncKind.Incremental,
          completionProvider: {},
          definitionProvider: {},
          referencesProvider: {},
          renameProvider: {},
        },
      } satisfies InitializeResult;
    });

    const completions = new CompletionItemProvider(languages, documents, trees, symbols);
    connection.onCompletion(async (params) => {
      return await completions.provideCompletionItems(params);
    });

    const definitions = new DefinitionProvider(languages, documents, trees, symbols);
    connection.onDefinition(async (params) => {
      return await definitions.provideDefinition(params);
    });

    connection.onReferences((params) => {
      return [];
    });

    connection.onRenameRequest((params) => {
      return {};
    });

    connection.onRequest(CustomMessages.QueueInit, async (uris) => {
      await symbols.initFiles(uris);
      await symbols.unleashFiles();
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
