import { LanguageService, TextDocument, Node, Range } from "vscode-html-languageservice";
import { CompletionItem } from "vscode";
import { RemoteCSSAnalysisSerivce } from "./remoteCSS";
import { CSSDocAnalysisService } from "./cssDocAnalysisService";

export interface HTMLDocAnalysisService {
    getAllCompletionItem(textDocument: TextDocument): Promise<CompletionItem[]>;
}

export class HTMLAnalysisService implements HTMLDocAnalysisService {
    private url: string[] = [];
    private embeddingCSS: string[] = [];
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
        let items = await this.remoteCSSAnalysisSerivce.getAllCompletionItems(this.url);
        if (this.embeddingCSS.length > 0) {
            let embeddingCSSText = this.embeddingCSS.reduce((total, current) => total += current);
            let embeddingCSSDoc = TextDocument.create("", "", 0, embeddingCSSText);
            items = items.concat(await this.cssDocAnalysisService.TextDocAnalysis(embeddingCSSDoc));
        }
        return items;
    }

    private refresh(textDocument: TextDocument): void {
        this.url = [];
        this.embeddingCSS = [];
        let htmlDoc = this.htmlService.parseHTMLDocument(textDocument);
        htmlDoc.roots.forEach(node => this.findUrlAndCSS(textDocument, node));
    }

    // 查找link的url和内嵌的css
    private findUrlAndCSS(textDocument: TextDocument, node: Node) {
        if (node.tag === "link") {
            if (node.attributes !== undefined) {
                let href = node.attributes["href"];
                if (href !== null && href.length > 2) {
                    this.url.push(href.substr(1, href.length - 2));
                }
            }
        } else if (node.tag === "style") {
            if (node.startTagEnd !== undefined && node.endTagStart !== undefined) {
                this.embeddingCSS.push(textDocument.getText(Range.create(textDocument.positionAt(node.startTagEnd), textDocument.positionAt(node.endTagStart))));
            }
        }
        node.children.forEach(n => {
            this.findUrlAndCSS(textDocument, n);
        });
    }
}
