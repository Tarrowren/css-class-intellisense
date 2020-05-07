import {
    CompletionItem,
    CompletionItemKind,
    createConnection,
    Diagnostic,
    DidChangeConfigurationNotification,
    InitializeParams,
    InitializeResult,
    ProposedFeatures,
    TextDocuments,
    TextDocumentSyncKind,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

let connection = createConnection(ProposedFeatures.all);
let documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability: boolean = false;
let hasWorkspaceFolderCapability: boolean = false;
let hasDiagnosticRelatedInformationCapability: boolean = false;

connection.onInitialize((params: InitializeParams) => {
    let capabilities = params.capabilities;
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
                resolveProvider: true,
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

interface CSSClassIntellisenseSettings {
    remoteCSSCachePath: string;
}

const defaultSettings: CSSClassIntellisenseSettings = {
    remoteCSSCachePath: "",
};
let globalSettings: CSSClassIntellisenseSettings = defaultSettings;
let documentSettings: Map<
    string,
    Thenable<CSSClassIntellisenseSettings>
> = new Map();

connection.onDidChangeConfiguration((change) => {
    if (hasConfigurationCapability) {
        documentSettings.clear();
    } else {
        globalSettings = <CSSClassIntellisenseSettings>(
            (change.settings.cssClassIntellisense || defaultSettings)
        );
    }

    documents.all().forEach(validateTextDocument);
});

function getDocumentSettings(
    resource: string
): Thenable<CSSClassIntellisenseSettings> {
    if (!hasConfigurationCapability) {
        return Promise.resolve(globalSettings);
    }
    let result = documentSettings.get(resource);
    if (!result) {
        result = connection.workspace.getConfiguration({
            scopeUri: resource,
            section: "cssClassIntellisense",
        });
        documentSettings.set(resource, result);
    }
    return result;
}

documents.onDidClose((e) => {
    documentSettings.delete(e.document.uri);
});

documents.onDidChangeContent((change) => {
    validateTextDocument(change.document);
});

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
    let settings = await getDocumentSettings(textDocument.uri);
    let text = textDocument.getText();

    let problems = 0;
    let diagnostics: Diagnostic[] = [];

    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

connection.onDidChangeWatchedFiles(() => {
    connection.console.log("We received an file change event");
});

connection.onCompletion((): CompletionItem[] => {
    return [
        {
            label: "TypeScript",
            kind: CompletionItemKind.Text,
            data: 1,
        },
        {
            label: "JavaScript",
            kind: CompletionItemKind.Text,
            data: 2,
        },
    ];
});

connection.onCompletionResolve(
    (item: CompletionItem): CompletionItem => {
        if (item.data === 1) {
            item.detail = "TypeScript details";
            item.documentation = "TypeScript documentation";
        } else if (item.data === 2) {
            item.detail = "JavaScript details";
            item.documentation = "JavaScript documentation";
        }
        return item;
    }
);

documents.listen(connection);
connection.listen();
