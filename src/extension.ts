import { ExtensionContext, languages } from "vscode";
import { ElementClassCompletionItemProvider } from "./elementClassCompletionItemProvider";

export function activate(context: ExtensionContext) {
    const provider = new ElementClassCompletionItemProvider();
    context.subscriptions.push(
        languages.registerCompletionItemProvider({ scheme: "file", language: "html" }, provider)
    );
}

export function deactivate() { }