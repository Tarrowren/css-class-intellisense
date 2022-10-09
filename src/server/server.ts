import { Connection, TextDocumentSyncKind } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { getLanguageModes, isCompletionItemData } from "./modes/languageModes";
import { runSafeAsync, RuntimeEnvironment } from "./runner";

export function startServer(
  connection: Connection,
  runtime: RuntimeEnvironment
) {
  const documents = new Map<string, TextDocument>();

  const languageModes = getLanguageModes(runtime.request, documents);

  connection.onInitialize((params) => {
    return {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
        completionProvider: {
          resolveProvider: true,
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

      const outdated = documents.get(uri);
      if (!outdated) {
        return;
      }

      const doc = TextDocument.update(outdated, contentChanges, version);
      documents.set(uri, doc);
    }
  );
  connection.onDidCloseTextDocument(({ textDocument: { uri } }) => {
    const document = documents.get(uri);
    if (document) {
      documents.delete(uri);
      languageModes.onDocumentRemoved(document);
    }
  });

  connection.onCompletion(({ textDocument, position }, token) => {
    return runSafeAsync(
      runtime,
      async () => {
        const document = documents.get(textDocument.uri);
        if (!document) {
          return null;
        }

        const mode = languageModes.getMode(document.languageId);
        if (!mode) {
          return null;
        }

        return await mode.doComplete(document, position);
      },
      null,
      `Error while computing completions for ${textDocument.uri}`,
      token
    );
  });

  connection.onCompletionResolve((item, token) => {
    return runSafeAsync(
      runtime,
      async () => {
        const data = item.data;
        if (isCompletionItemData(data)) {
          const mode = languageModes.getMode(data.languageId);
          const document = documents.get(data.uri);
          if (mode && mode.doResolve && document) {
            return await mode.doResolve(document, item);
          }
        }
        return item;
      },
      item,
      `Error while resolving completion proposal`,
      token
    );
  });

  connection.onShutdown(() => {
    languageModes.dispose();
  });

  connection.listen();
}
