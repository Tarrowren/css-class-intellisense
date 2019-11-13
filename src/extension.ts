import { getLanguageService } from "vscode-html-languageservice";
import { getCSSLanguageService } from "vscode-css-languageservice";
import { ExtensionContext, workspace, languages } from "vscode";
import { CssCompletionItemProvider } from "./cssCompletionItemProvider";

const htmlService = getLanguageService();
const cssService = getCSSLanguageService();

export function activate(context: ExtensionContext) {
	let cssProvider = new CssCompletionItemProvider(htmlService, cssService);

	// 保存html文件时更新CompletionItems
	context.subscriptions.push(workspace.onDidSaveTextDocument(doc => {
		if (doc.languageId === 'html') {
			cssProvider.refreshCompletionItems();
		}
	}));
	context.subscriptions.push(languages.registerCompletionItemProvider({ scheme: 'file', language: 'html' }, cssProvider));
}

export function deactivate() { }