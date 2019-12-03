import { CompletionItemProvider, CompletionItem, TextDocument, Position, CancellationToken, CompletionContext, ProviderResult, window } from "vscode";
import { HTMLDocAnalysisService } from "./htmlDocAnalysisService";
import * as html from "vscode-html-languageservice";

export class CssCompletionItemProvider implements CompletionItemProvider {
    private completionItems: Promise<CompletionItem[]> | undefined;
    private htmlDocAnalysisService: HTMLDocAnalysisService;

    constructor(htmlDocAnalysisService: HTMLDocAnalysisService) {
        this.htmlDocAnalysisService = htmlDocAnalysisService;
        this.refreshCompletionItems();
    }

    provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext): ProviderResult<CompletionItem[]> {
        // 判断光标是否在class内
        let line = document.lineAt(position).text;
        let start = line.substring(0, position.character).search(/class\s*=\s*("([^"]*)$|'([^']*)$)/i);
        if (start !== -1) {
            return this.completionItems;
        } else {
            return;
        }
    }

    refreshCompletionItems() {
        try {
            let editor = window.activeTextEditor;
            if (editor === undefined) {
                throw new Error("No Active Text Editor");
            }
            let doc = editor.document;
            if (doc.languageId !== 'html') {
                throw new Error('Not an HTML file');
            }
            // 从文档中获取style下的class与link的uri
            let textDoc = html.TextDocument.create(doc.uri.fsPath, doc.languageId, doc.version, doc.getText());
            this.completionItems = this.htmlDocAnalysisService.getAllCompletionItem(textDoc);
        }
        catch (err) {
            window.showErrorMessage(`[css-class-intellisense] ERROR! ${err.message}`);
        }
    }
}
