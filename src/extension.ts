import { getLanguageService } from "vscode-html-languageservice";
import { getCSSLanguageService } from "vscode-css-languageservice";
import { ExtensionContext, workspace, languages } from "vscode";
import { CssCompletionItemProvider } from "./cssCompletionItemProvider";
import { HTMLAnalysisService } from "./htmlDocAnalysisService";
import { CSSAnalysisService } from "./cssDocAnalysisService";
import { RemoteCSSAnalysisRepo } from "./remoteCSS";

export function activate(context: ExtensionContext) {
	// 注册服务
	const htmlService = getLanguageService();
	const cssService = getCSSLanguageService();
	const cssAnalysisService = new CSSAnalysisService(cssService);
	const remoteCSSAnalysisRepo = new RemoteCSSAnalysisRepo(cssAnalysisService);
	const cssProvider = new CssCompletionItemProvider(new HTMLAnalysisService(htmlService, cssAnalysisService, remoteCSSAnalysisRepo));

	// 保存html文件时更新CompletionItems
	context.subscriptions.push(workspace.onDidSaveTextDocument(doc => {
		if (doc.languageId === 'html') {
			cssProvider.refreshCompletionItems();
		}
	}));

	context.subscriptions.push(languages.registerCompletionItemProvider({ scheme: 'file', language: 'html' }, cssProvider));
}

export function deactivate() { }
