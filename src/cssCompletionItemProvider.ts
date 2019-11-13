import * as vscode from "vscode";
import * as css from "vscode-css-languageservice";
import * as html from "vscode-html-languageservice";
import * as path from "path";
import * as https from "https";

export class CssCompletionItemProvider implements vscode.CompletionItemProvider {
    private htmlService: html.LanguageService;
    private cssService: css.LanguageService;
    private completionItems: Promise<vscode.CompletionItem[]>;

    constructor(htmlService: html.LanguageService, cssService: css.LanguageService) {
        this.htmlService = htmlService;
        this.cssService = cssService;
        this.completionItems = this.cssAggregator().then(
            cssClasses => cssClasses.map(cssClass => new vscode.CompletionItem(cssClass))
        );
    }

    provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext): vscode.ProviderResult<vscode.CompletionItem[]> {
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
        this.completionItems = this.cssAggregator().then(
            cssClasses => cssClasses.map(cssClass => new vscode.CompletionItem(cssClass))
        );
    }

    private cssAggregator(): Promise<string[]> {
        let editor = vscode.window.activeTextEditor;
        if (editor === undefined) {
            return Promise.reject('Active text editor is undefined');
        }
        let doc = editor.document;
        if (doc.languageId !== 'html') {
            return Promise.reject('Not an HTML file');
        }

        // 从文档中获取style下的class与link的uri
        let textDoc = html.TextDocument.create(doc.uri.fsPath, doc.languageId, doc.version, doc.getText());
        let htmlDoc = this.htmlService.parseHTMLDocument(textDoc);
        let uris = <string[]>[];
        htmlDoc.roots.forEach(node => this.findUri(node, uris));

        // 转为绝对路径
        let absoluteUris = uris.map(uri => {
            console.log(uri);
            if (uri.search(/https/i) === 0) {
                return uri;
            }
            if (path.isAbsolute(uri)) {
                return uri;
            } else {
                return path.resolve(doc.uri.fsPath, `../${uri}`);
            }
        });

        return this.openCssDoc(absoluteUris);
    }

    private findUri(node: html.Node, uris: string[]) {
        if (node.tag === 'link') {
            if (node.attributes !== undefined) {
                let href = node.attributes['href'];
                if (href !== null && href.length > 2) {
                    uris.push(href.substr(1, href.length - 2));
                }
            }
        }
        node.children.forEach(n => {
            this.findUri(n, uris);
        });
    }

    private openCssDoc(uris: string[]): Promise<string[]> {
        return uris.map(async uri => {
            try {
                let textDoc: css.TextDocument;
                if (uri.search(/https/i) === 0) {
                    const result: string = await new Promise((resolve) => {
                        https.get(uri, res => {
                            let doc = "";
                            res.on("data", chunk => doc += chunk).on("end", () => resolve(doc));
                        });
                    });
                    textDoc = css.TextDocument.create(uri, "css", 1, result);
                } else {
                    const doc = await vscode.workspace.openTextDocument(uri);
                    textDoc = css.TextDocument.create(doc.uri.fsPath, doc.languageId, doc.version, doc.getText());
                }
                const symbols = this.cssService.findDocumentSymbols(textDoc, this.cssService.parseStylesheet(textDoc));
                return Array.from(new Set(symbols.filter(symbol => symbol.kind === 5).map(symbol => {
                    let arr = symbol.name.split(/\.([a-zA-Z0-9-_]+)/);
                    arr.shift();
                    return arr.filter(s => s.search(/[a-zA-Z0-9-_]/) === 0);
                }).reduce((total, current) => total.concat(current))));
            } catch (err) {
                vscode.window.showErrorMessage(`Cannot read file ${uri}, ${err}`);
            }
            return [];
        }).reduce(async (total, current) => (await total).concat(await current));
    }
}