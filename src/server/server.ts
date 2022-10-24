import { Connection, RequestType, TextDocumentSyncKind } from "vscode-languageserver";
import { URI } from "vscode-uri";
import { getDocumentStore } from "./document/store";
import { getLanguageModes, isCompletionItemData } from "./modes/language-modes";
import { RequestService, runSafeAsync, RuntimeEnvironment } from "./runner";

export type DestroyHandler = () => Promise<void>;
export type onLanguageServerInitialize = (options: any) => Promise<DestroyHandler>;

namespace VSCodeRemoteFileRequest {
  export const type: RequestType<string, string, void> = new RequestType("vscode/remote-file");
}

export function startServer(
  connection: Connection,
  runtime: RuntimeEnvironment,
  onInitialize?: onLanguageServerInitialize
) {
  const request: RequestService = {
    getContent(uri) {
      if (uri.scheme === "http" || uri.scheme === "https") {
        return runtime.http.getContent(uri);
      } else {
        return runtime.file.getContent(uri);
      }
    },
  };

  const store = getDocumentStore(request);
  const languageModes = getLanguageModes(runtime, store);

  let destroy: DestroyHandler | null | undefined;

  connection.onInitialize(async (params) => {
    destroy = await onInitialize?.(params.initializationOptions);

    return {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
        completionProvider: {
          resolveProvider: true,
        },
        definitionProvider: true,
        referencesProvider: true,
        workspace: {
          workspaceFolders: {
            supported: !!params.capabilities.workspace?.workspaceFolders,
          },
        },
      },
    };
  });

  connection.onDidOpenTextDocument(({ textDocument: { languageId, text, uri, version } }) => {
    if (isCssClassIntellisenseScheme(uri)) {
      return;
    }

    store.open(uri, languageId, version, text);
  });
  connection.onDidChangeTextDocument(({ textDocument: { uri, version }, contentChanges }) => {
    if (contentChanges.length === 0 || isCssClassIntellisenseScheme(uri)) {
      return;
    }

    store.update(uri, contentChanges, version);
  });
  connection.onDidCloseTextDocument(({ textDocument: { uri } }) => {
    if (isCssClassIntellisenseScheme(uri)) {
      return;
    }

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

  connection.onDefinition(({ textDocument, position }, token) => {
    return runSafeAsync(
      runtime,
      async () => {
        const document = store.getMainTextDocument(textDocument.uri);
        if (!document) {
          return null;
        }

        const mode = languageModes.getMode(document.languageId);
        if (!mode || !mode.findDefinition) {
          return null;
        }

        return await mode.findDefinition(document, position);
      },
      null,
      `Error while computing definitions for ${textDocument.uri}`,
      token
    );
  });

  connection.onReferences(({ textDocument, position }, token) => {
    return runSafeAsync(
      runtime,
      async () => {
        const document = store.getOpenedReferenceTextDocument(textDocument.uri);
        if (!document) {
          return null;
        }

        const mode = languageModes.getMode(document.languageId);
        if (!mode || !mode.findReferences) {
          return null;
        }

        return await mode.findReferences(document, position);
      },
      null,
      `Error while computing references for ${textDocument.uri}`,
      token
    );
  });

  connection.onRequest(VSCodeRemoteFileRequest.type, (uri, token) => {
    return runSafeAsync(
      runtime,
      async () => {
        const doc = await store.getTextDocument(uri);
        return doc?.getText();
      },
      null,
      `Error while open text document for ${uri}`,
      token
    );
  });

  connection.onShutdown(async () => {
    store.dispose();
    languageModes.dispose();
    if (destroy) {
      await destroy();
      destroy = null;
    }
  });

  connection.listen();
}

function isCssClassIntellisenseScheme(uri: string) {
  return URI.parse(uri).scheme === "css-class-intellisense";
}
