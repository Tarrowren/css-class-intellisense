import { ExtensionContext, languages } from "vscode";
import { CSSClassCompletionItemProvider } from "./cssClassCompletionItemProvider";

export function activate(context: ExtensionContext) {
    const provider = new CSSClassCompletionItemProvider();
    context.subscriptions.push(languages.registerCompletionItemProvider({ scheme: "file", language: "html" }, provider));
}

export function deactivate() { }
