import { CancellationToken, CompletionContext, CompletionItem, CompletionItemProvider, Position, ProviderResult, TextDocument, TextDocumentChangeEvent } from "vscode";
import { HTMLDoc } from "./HTMLDoc";
import { LinkingLinter } from "./LinkingLinter";
import Parser = require("tree-sitter");

export class CCICompletionItemProvider implements CompletionItemProvider {
    private htmlDoc: HTMLDoc | null = null;
    private parser = new Parser();

    constructor(private linter: LinkingLinter) { }

    openTextDocument(doc: TextDocument): void {
        if (doc.languageId === "html") {
            if (this.htmlDoc) {
                this.htmlDoc.changeDoc(doc);
            } else {
                this.htmlDoc = new HTMLDoc(this.linter, doc, this.parser);
            }
        }
    }

    changeTextDocument(event: TextDocumentChangeEvent): void {
        if (this.htmlDoc && this.htmlDoc.isSameDoc(event.document)) {
            for (const e of event.contentChanges) {
                this.htmlDoc.editTree({
                    newEndIndex: e.rangeOffset + e.text.length,
                    newEndPosition: this.htmlDoc.pointAt(e.rangeOffset + e.text.length),
                    oldEndIndex: e.rangeOffset + e.rangeLength,
                    oldEndPosition: { column: e.range.end.character, row: e.range.end.line },
                    startIndex: e.rangeOffset,
                    startPosition: { column: e.range.start.character, row: e.range.start.line },
                });
            }
        } else if (event.document.languageId === "html") {
            if (this.htmlDoc) {
                this.htmlDoc.changeDoc(event.document);
            } else {
                this.htmlDoc = new HTMLDoc(this.linter, event.document, this.parser);
            }
        }
    }

    provideCompletionItems(document: TextDocument, position: Position, _token: CancellationToken, _context: CompletionContext): ProviderResult<CompletionItem[]> {
        console.time("test");
        if (!this.htmlDoc) {
            this.htmlDoc = new HTMLDoc(this.linter, document, this.parser);
        }
        let a;
        if (this.htmlDoc.isInAttributeValue({ column: position.character, row: position.line }, "class")) {
            a = this.htmlDoc.getCompletionItems();
        }
        console.timeEnd("test");
        return a;
    }
}
