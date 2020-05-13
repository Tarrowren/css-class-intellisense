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

interface CSSClassIntellisenseSettings {
    remoteCSSCachePath: string;
}

const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);
let languageModes: LanguageModes;

let hasConfigurationCapability: boolean = false;
let hasWorkspaceFolderCapability: boolean = false;
let hasDiagnosticRelatedInformationCapability: boolean = false;

const defaultSettings: CSSClassIntellisenseSettings = {
    remoteCSSCachePath: "",
};
let globalSettings: CSSClassIntellisenseSettings = defaultSettings;
let documentSettings: Map<
    string,
    Thenable<CSSClassIntellisenseSettings>
> = new Map();

connection.onInitialize((params: InitializeParams) => {
    languageModes = getLanguageModes();

    documents.onDidClose((e) => {
        languageModes.onDocumentRemoved(e.document);
        documentSettings.delete(e.document.uri);
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
    hasWorkspaceFolderCapability = !!(
        capabilities.workspace && !!capabilities.workspace.workspaceFolders
    );
    hasDiagnosticRelatedInformationCapability = !!(
        capabilities.textDocument &&
        capabilities.textDocument.publishDiagnostics &&
        capabilities.textDocument.publishDiagnostics.relatedInformation
    );

    const result: InitializeResult = {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Full,
            completionProvider: {
                resolveProvider: false,
            },
        },
    };
    if (hasWorkspaceFolderCapability) {
        result.capabilities.workspace = {
            workspaceFolders: {
                supported: true,
            },
        };
    }
    return result;
});

connection.onInitialized(() => {
    if (hasConfigurationCapability) {
        connection.client.register(
            DidChangeConfigurationNotification.type,
            undefined
        );
    }
    if (hasWorkspaceFolderCapability) {
        connection.workspace.onDidChangeWorkspaceFolders(() => {
            connection.console.log("Workspace folder change event received.");
        });
    }
});

connection.onDidChangeConfiguration((change) => {
    if (hasConfigurationCapability) {
        documentSettings.clear();
    } else {
        globalSettings = <CSSClassIntellisenseSettings>(
            (change.settings.cssClassIntellisense || defaultSettings)
        );
    }
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
    const doComplete = mode.doComplete!;

    return doComplete(document, textDocumentPosition.position);
});

documents.listen(connection);
connection.listen();
