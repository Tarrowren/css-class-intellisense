import * as path from "path";
import { LanguageService, TextDocument, Node, Range } from "vscode-html-languageservice";
import { CompletionItem, workspace, window } from "vscode";
import { RemoteCSSAnalysisSerivce } from "./remoteCSS";
import { CSSDocAnalysisService } from "./cssDocAnalysisService";

export interface HTMLDocAnalysisService {
    getAllCompletionItem(textDocument: TextDocument): Promise<CompletionItem[]>;
}

export class HTMLAnalysisService implements HTMLDocAnalysisService {
    private remoteLinks: string[] = [];
    private localLinks: string[] = [];
    private embeddingCSS: string = "";
    private htmlService: LanguageService;
    private cssDocAnalysisService: CSSDocAnalysisService;
    private remoteCSSAnalysisSerivce: RemoteCSSAnalysisSerivce;

    constructor(htmlService: LanguageService, cssDocAnalysisService: CSSDocAnalysisService, remoteCSSAnalysisSerivce: RemoteCSSAnalysisSerivce) {
        this.htmlService = htmlService;
        this.cssDocAnalysisService = cssDocAnalysisService;
        this.remoteCSSAnalysisSerivce = remoteCSSAnalysisSerivce;
    }

    public async getAllCompletionItem(textDocument: TextDocument): Promise<CompletionItem[]> {
        this.refresh(textDocument);
        return Promise.resolve(
            (await this.cssDocAnalysisService.TextDocAnalysis(TextDocument.create("", "", 0, this.embeddingCSS)))
                .concat(await this.getLocalCSSAnalysis())
                .concat(await this.remoteCSSAnalysisSerivce.getAllCompletionItems(this.remoteLinks)));
    }

    public changeRemoteCSSAnalysisSerivce(remoteCSSAnalysisSerivce: RemoteCSSAnalysisSerivce) {
        this.remoteCSSAnalysisSerivce = remoteCSSAnalysisSerivce;
    }

    private getLocalCSSAnalysis(): Promise<CompletionItem[]> {
        let arr = this.localLinks.map(async link => {
            try {
                let doc = await workspace.openTextDocument(link);
                let textDoc = TextDocument.create(doc.uri.fsPath, doc.languageId, doc.version, doc.getText());
                return this.cssDocAnalysisService.TextDocAnalysis(textDoc);
            } catch (err) {
                window.showErrorMessage(`[css class intellisense] ${err.message}`);
                return Promise.resolve(<CompletionItem[]>[]);
            }
        });
        if (arr.length > 0) {
            return arr.reduce(async (total, current) => (await total).concat(await current));
        } else {
            return Promise.resolve(<CompletionItem[]>[]);
        }
    }

    private refresh(textDocument: TextDocument): void {
        this.remoteLinks = [];
        this.localLinks = [];
        this.embeddingCSS = "";
        let htmlDoc = this.htmlService.parseHTMLDocument(textDocument);
        htmlDoc.roots.forEach(node => this.findUrlAndCSS(textDocument, node));
    }

    // 查找link的url和内嵌的css
    private findUrlAndCSS(textDocument: TextDocument, node: Node) {
        if (node.tag === "link") {
            if (node.attributes !== undefined) {
                let href = node.attributes["href"];
                if (href !== null && href.length > 2) {
                    let url = href.substr(1, href.length - 2);
                    if (url.search("http") === 0) {
                        this.remoteLinks.push(url);
                    } else {
                        if (path.isAbsolute(url)) {
                            this.localLinks.push(url);
                        } else {
                            this.localLinks.push(path.resolve(textDocument.uri, `../${url}`));
                        }
                    }
                }
            }
        } else if (node.tag === "style") {
            if (node.startTagEnd !== undefined && node.endTagStart !== undefined) {
                this.embeddingCSS += textDocument.getText(Range.create(textDocument.positionAt(node.startTagEnd), textDocument.positionAt(node.endTagStart)));
            }
        }
        node.children.forEach(n => {
            this.findUrlAndCSS(textDocument, n);
        });
    }
}
