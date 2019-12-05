import { getLanguageService } from "vscode-html-languageservice";
import { getCSSLanguageService } from "vscode-css-languageservice";
import { ExtensionContext, workspace, languages } from "vscode";
import { CssCompletionItemProvider } from "./cssCompletionItemProvider";
import { HTMLAnalysisService } from "./htmlDocAnalysisService";
import { CSSAnalysisService } from "./cssDocAnalysisService";
import { RemoteCSSAnalysisRepo, CloseRemoteCSSAnalysisRepo } from "./remoteCSS";

export function activate(context: ExtensionContext) {
	// 注册服务
	const htmlService = getLanguageService();
	const cssService = getCSSLanguageService();
	const cssAnalysisService = new CSSAnalysisService(cssService);
	const remoteCSSAnalysisRepo = new RemoteCSSAnalysisRepo(cssAnalysisService);
	const closeRemoteCSSAnalysisRepo = new CloseRemoteCSSAnalysisRepo();
	const htmlAnalysisService = new HTMLAnalysisService(htmlService, cssAnalysisService, closeRemoteCSSAnalysisRepo);
	const cssProvider = new CssCompletionItemProvider(htmlAnalysisService);

	// 按配置开启远程CSS支持
	let remoteCSSSupport: boolean | undefined = workspace.getConfiguration().get("Remote CSS Support");
	if (remoteCSSSupport) {
		htmlAnalysisService.changeRemoteCSSAnalysisSerivce(remoteCSSAnalysisRepo);
	}

	context.subscriptions.push(
		// 保存html文件时更新CompletionItems
		workspace.onDidSaveTextDocument(doc => {
			if (doc.languageId === 'html') {
				let remoteCSSSupport: boolean | undefined = workspace.getConfiguration().get("Remote CSS Support");
				if (remoteCSSSupport) {
					htmlAnalysisService.changeRemoteCSSAnalysisSerivce(remoteCSSAnalysisRepo);
				} else {
					htmlAnalysisService.changeRemoteCSSAnalysisSerivce(closeRemoteCSSAnalysisRepo);
				}
				cssProvider.refreshCompletionItems();
			}
		}),
		// 注册服务
		languages.registerCompletionItemProvider({ scheme: 'file', language: 'html' }, cssProvider)
	);
}

export function deactivate() { }
