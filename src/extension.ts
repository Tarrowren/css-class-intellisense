import { Diagnostic, ExtensionContext, languages, workspace } from "vscode";
import { CCICompletionItemProvider } from "./CCICompletionItemProvider";
import { LinkingLinter } from "./LinkingLinter";

export function activate(context: ExtensionContext) {
    const linter = new LinkingLinter();

    const provider = new CCICompletionItemProvider(linter);
    const diagnosticCollection = languages.createDiagnosticCollection();

    let diagnostics = <Diagnostic[]>[];

    context.subscriptions.push(languages.registerCompletionItemProvider({ scheme: "file", language: "html" }, provider));
    context.subscriptions.push(diagnosticCollection);
    context.subscriptions.push(linter.onDidChangeDiagnostics(e => {
        diagnosticCollection.delete(e.uri);
        if (e.diagnostic) {
            diagnostics.push(e.diagnostic);
            diagnosticCollection.set(e.uri, diagnostics);
        } else {
            diagnostics = [];
        }
    }));
    context.subscriptions.push(workspace.onDidChangeTextDocument(event => provider.changeTextDocument(event)));
    context.subscriptions.push(workspace.onDidOpenTextDocument(doc => provider.openTextDocument(doc)));
    context.subscriptions.push(workspace.onDidCloseTextDocument(doc => diagnosticCollection.delete(doc.uri)));
}

export function deactivate() { }
