import { Connection, Disposable, ResponseError, TextDocumentSyncKind } from "vscode-languageserver";
import { getDocumentStore } from "./document/store";
import { getLanguageModes, isCompletionItemData } from "./modes/language-modes";
import { RequestService, runSafeAsync, RuntimeEnvironment } from "./runner";

export type onLanguageServerInitialize = (options: any) => Promise<Disposable>;

export function startServer(
  connection: Connection,
  runtime: RuntimeEnvironment,
  onInitialize?: onLanguageServerInitialize
) {
  const request: RequestService = {
    getContent(uri) {
      if (uri.scheme === "untitled") {
        throw new ResponseError(3, `Unable to load ${uri.toString()}`);
      }

      if (uri.scheme === "http" || uri.scheme === "https") {
        return runtime.http.getContent(uri);
      } else {
        return runtime.file.getContent(uri);
      }
    },
  };

  const store = getDocumentStore(request);
  const languageModes = getLanguageModes(runtime, store);

  let disposable: Disposable | undefined;

  connection.onInitialize(async (params) => {
    disposable = await onInitialize?.(params.initializationOptions);

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

  connection.onDidOpenTextDocument(({ textDocument: { languageId, text, uri, version } }) => {
    store.open(uri, languageId, version, text);
  });
  connection.onDidChangeTextDocument(({ textDocument: { uri, version }, contentChanges }) => {
    if (contentChanges.length === 0) {
      return;
    }
    store.update(uri, contentChanges, version);
  });
  connection.onDidCloseTextDocument(({ textDocument: { uri } }) => {
    const doc = store.getMainTextDocument(uri);
    store.delete(uri);
    if (doc) {
      languageModes.onDocumentRemoved(doc);
    }
  });

  connection.onCompletion(({ textDocument, position }, token) => {
    return runSafeAsync(
      runtime,
      async () => {
        const document = store.getMainTextDocument(textDocument.uri);
        if (!document) {
          return null;
        }

        const mode = languageModes.getMode(document.languageId);
        if (!mode || !mode.doComplete) {
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
        if (!isCompletionItemData(data)) {
          return item;
        }

        const document = store.getMainTextDocument(data.uri);
        if (!document) {
          return item;
        }

        const mode = languageModes.getMode(data.languageId);

        if (!mode || !mode.doResolve) {
          return item;
        }

        return await mode.doResolve(document, item);
      },
      item,
      `Error while resolving completion proposal`,
      token
    );
  });

  connection.onShutdown(() => {
    store.dispose();
    languageModes.dispose();
    disposable?.dispose();
  });

  connection.listen();
}
