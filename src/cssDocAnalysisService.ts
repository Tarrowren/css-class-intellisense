
import { TextDocument, LanguageService } from "vscode-css-languageservice";
import { CompletionItem } from "vscode";

export interface CSSDocAnalysisService {
    TextDocAnalysis(textDocument: TextDocument): Promise<CompletionItem[]>;
}

export class CSSAnalysisService implements CSSDocAnalysisService {
    private cssService: LanguageService;

    constructor(cssService: LanguageService) {
        this.cssService = cssService;
    }

    public async TextDocAnalysis(textDocument: TextDocument): Promise<CompletionItem[]> {
        let symbols = this.cssService.findDocumentSymbols(textDocument, this.cssService.parseStylesheet(textDocument));
        return Array.from(new Set(symbols.filter(symbol => symbol.kind === 5).map(symbol => {
            let arr = symbol.name.split(/\.([a-zA-Z0-9-_]+)/);
            arr.shift();
            return arr.filter(s => s.search(/[a-zA-Z-_]/) === 0);
        }).reduce((total, current) => total.concat(current)))).map(cssClass => new CompletionItem(cssClass));
    }
}
