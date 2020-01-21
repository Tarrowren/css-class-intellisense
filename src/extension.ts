import { Diagnostic, ExtensionContext, languages, workspace } from "vscode";
import { CCICompletionItemProvider } from "./CCICompletionItemProvider";
import { LinkingLinter } from "./LinkingLinter";

export function activate(context: ExtensionContext) {
    const config = workspace.getConfiguration().get("cssClassIntellisense.remoteCSSCachePath") as string;

    const linter = new LinkingLinter();
    const provider = new CCICompletionItemProvider(linter, config);
    const diagnosticCollection = languages.createDiagnosticCollection();

    let diagnostics = <Diagnostic[]>[];

    context.subscriptions.push(languages.registerCompletionItemProvider({ scheme: "file", language: "html" }, provider));
    context.subscriptions.push(diagnosticCollection);
    context.subscriptions.push(linter.onDidChangeDiagnostics(e => {
        if (e.diagnostic) {
            diagnostics.push(e.diagnostic);
        } else {
            diagnosticCollection.set(e.uri, diagnostics);
            diagnostics = [];
        }
    }));
    context.subscriptions.push(workspace.onDidChangeTextDocument(event => provider.changeTextDocument(event)));
    context.subscriptions.push(workspace.onDidOpenTextDocument(doc => provider.openTextDocument(doc)));
    context.subscriptions.push(workspace.onDidCloseTextDocument(doc => diagnosticCollection.delete(doc.uri)));
    context.subscriptions.push(workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration("cssClassIntellisense.remoteCSSCachePath")) {
            const config = workspace.getConfiguration().get<string>("cssClassIntellisense.remoteCSSCachePath") as string;
            provider.setConfiguration(config);
        }
    }));
}

export function deactivate() { }
