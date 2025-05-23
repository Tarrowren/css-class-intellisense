import { CustomMessages } from "shared";
import {
  CompletionItem,
  TextDocuments,
  TextDocumentSyncKind,
  type Connection,
  type InitializeResult,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

export class Server {
  static create(connection: Connection) {
    const documents = new TextDocuments(TextDocument);
    documents.onDidChangeContent(({ document }) => {
      logger.info(`[ChangeContent] ${document.uri}`);
    });
    documents.listen(connection);

    connection.onInitialize((params, token, workDoneProgress, resultProgress) => {
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

    connection.onCompletion((params, token, workDoneProgress, resultProgress) => {
      return [CompletionItem.create("test")];
    });

    connection.onDefinition((params, token, workDoneProgress, resultProgress) => {
      return [];
    });

    connection.onReferences((params, token, workDoneProgress, resultProgress) => {
      return [];
    });

    connection.onRenameRequest((params, token, workDoneProgress, resultProgress) => {
      return {};
    });

    connection.onRequest(CustomMessages.QueueInit, (uris) => {
      // TODO
    });

    connection.onDidChangeWatchedFiles(({ changes }) => {
      for (const { type, uri } of changes) {
        logger.info(`[ChangeWatchedFiles] ${type} ${uri}`);
      }
    });

    connection.listen();
  }
}
