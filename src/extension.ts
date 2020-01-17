import * as Parser from "tree-sitter";
import { ExtensionContext, languages } from "vscode";
import { CSSClassCompletionItemProvider } from "./CSSClassCompletionItemProvider";

export function activate(context: ExtensionContext) {
    const parser = new Parser();
    const completionItemProvider = new CSSClassCompletionItemProvider(parser);
    context.subscriptions.push(languages.registerCompletionItemProvider({ scheme: "file", language: "html" }, completionItemProvider));
}

export function deactivate() { }
