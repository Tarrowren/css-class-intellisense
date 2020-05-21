import {
    createConnection,
    DidChangeConfigurationNotification,
    InitializeParams,
    InitializeResult,
    ProposedFeatures,
    TextDocuments,
    TextDocumentSyncKind,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { getLanguageModes, LanguageModes } from "./languageModes";

export const connection = createConnection(ProposedFeatures.all);

const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);
let languageModes: LanguageModes;

let hasConfigurationCapability: boolean = false;

interface CSSClassIntellisenseSettings {
    silentDownload: boolean;
    remoteCSSCachePath: string;
}

const defaultSettings: CSSClassIntellisenseSettings = {
    silentDownload: false,
    remoteCSSCachePath: "",
};
export let globalSettings: CSSClassIntellisenseSettings = defaultSettings;

connection.onInitialize((params: InitializeParams) => {
    languageModes = getLanguageModes();

    documents.onDidClose((e) => {
        languageModes.onDocumentRemoved(e.document);
    });

    documents.onDidChangeContent((e) => {
        languageModes.onChangeCSSDoc(e.document);
    });

    connection.onShutdown(() => {
        languageModes.dispose();
    });

    const capabilities = params.capabilities;
    hasConfigurationCapability = !!(
        capabilities.workspace && !!capabilities.workspace.configuration
    );

    const result: InitializeResult = {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Full,
            completionProvider: {
                resolveProvider: false,
                triggerCharacters: [".", "#"],
            },
        },
    };

    return result;
});

connection.onInitialized(async () => {
    if (hasConfigurationCapability) {
        globalSettings = await connection.workspace.getConfiguration({
            section: "cssClassIntellisense",
        });
        connection.client.register(DidChangeConfigurationNotification.type, {
            section: "cssClassIntellisense",
        });
    }
});

connection.onDidChangeConfiguration(async () => {
    globalSettings = await connection.workspace.getConfiguration({
        section: "cssClassIntellisense",
    });
});

connection.onCompletion((textDocumentPosition) => {
    const document = documents.get(textDocumentPosition.textDocument.uri);
    if (!document) {
        return null;
    }
    const mode = languageModes.getModeAtPosition(
        document,
        textDocumentPosition.position
    );
    if (!mode || !mode.doComplete) {
        return [];
    }
    const doComplete = mode.doComplete;

    return doComplete(document, textDocumentPosition.position);
});

documents.listen(connection);
connection.listen();
