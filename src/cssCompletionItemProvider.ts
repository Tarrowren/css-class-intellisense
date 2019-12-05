import { CompletionItemProvider, CompletionItem, TextDocument, Position, CancellationToken, CompletionContext, ProviderResult, window } from "vscode";
import { HTMLDocAnalysisService } from "./htmlDocAnalysisService";
import * as html from "vscode-html-languageservice";

export class CssCompletionItemProvider implements CompletionItemProvider {
    private lastTextDocument: TextDocument | undefined;
    private completionItems: Promise<CompletionItem[]> | undefined;
    private htmlDocAnalysisService: HTMLDocAnalysisService;

    constructor(htmlDocAnalysisService: HTMLDocAnalysisService) {
        this.htmlDocAnalysisService = htmlDocAnalysisService;
        this.refreshCompletionItems();
    }

    public provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext): ProviderResult<CompletionItem[]> {
        // 切换文档时刷新
        if (this.lastTextDocument !== document) {
            this.lastTextDocument = document;
            this.refreshCompletionItems();
        }
        // 判断光标是否在class内
        let line = document.lineAt(position).text;
        let start = line.substring(0, position.character).search(/class\s*=\s*("([^"]*)$|'([^']*)$)/i);
        if (start !== -1) {
            return this.completionItems;
        } else {
            return;
        }
    }

    public refreshCompletionItems() {
        let editor = window.activeTextEditor;
        if (editor === undefined) {
            return;
        }
        let doc = editor.document;
        if (doc.languageId !== 'html') {
            return;
        }
        // 从文档中获取style下的class与link的uri
        let textDoc = html.TextDocument.create(doc.uri.fsPath, doc.languageId, doc.version, doc.getText());
        this.completionItems = this.htmlDocAnalysisService.getAllCompletionItem(textDoc);
    }
}
