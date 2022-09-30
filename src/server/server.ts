import { Connection, TextDocumentSyncKind } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { doComplete } from "./languageFeatures/completion";
import { runSafeAsync, RuntimeEnvironment } from "./runner";

export function startServer(
  connection: Connection,
  runtime: RuntimeEnvironment
) {
  const documents = new Map<string, TextDocument>();

  connection.onInitialize((params) => {
    return {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
        completionProvider: {
          completionItem: {
            labelDetailsSupport: true,
          },
        },
        workspace: {
          workspaceFolders: {
            supported: !!params.capabilities.workspace?.workspaceFolders,
          },
        },
      },
    };
  });

  connection.onDidOpenTextDocument(
    ({ textDocument: { languageId, text, uri, version } }) => {
      const doc = TextDocument.create(uri, languageId, version, text);
      documents.set(uri, doc);
    }
  );
  connection.onDidChangeTextDocument(
    ({ textDocument: { uri, version }, contentChanges }) => {
      if (contentChanges.length === 0) {
        return;
      }

      const old = documents.get(uri)!;

      const doc = TextDocument.update(old, contentChanges, version);
      documents.set(uri, doc);
    }
  );
  connection.onDidCloseTextDocument(({ textDocument: { uri } }) => {
    documents.delete(uri);
  });

  connection.onCompletion(({ textDocument, position }, token) => {
    return runSafeAsync(
      runtime,
      async () => {
        const document = documents.get(textDocument.uri);
        if (!document) {
          return null;
        }

        return await doComplete(document, position);
      },
      null,
      `Error while computing completions for ${textDocument.uri}`,
      token
    );
  });

  connection.onShutdown(() => {});

  connection.listen();
}
