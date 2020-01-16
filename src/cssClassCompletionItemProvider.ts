import { CancellationToken, CompletionContext, CompletionItem, CompletionItemProvider, Position, ProviderResult, TextDocument, TextDocumentChangeEvent, workspace } from "vscode";
import { HTMLDocument } from "./HTMLDocument";

export class CSSClassCompletionItemProvider implements CompletionItemProvider {
    private htmlDocument: HTMLDocument | undefined;

    constructor() {
        workspace.onDidChangeTextDocument(event => {
            if (this.htmlDocument && this.htmlDocument.isSameDocument(event.document)) {
                for (const e of event.contentChanges) {
                    this.htmlDocument.editTree({
                        newEndIndex: e.rangeOffset + e.text.length,
                        newEndPosition: this.htmlDocument.pointAt(e.rangeOffset + e.text.length),
                        oldEndIndex: e.rangeOffset + e.rangeLength,
                        oldEndPosition: { column: e.range.end.character, row: e.range.end.line },
                        startIndex: e.rangeOffset,
                        startPosition: { column: e.range.start.character, row: e.range.start.line },
                    });
                }
            }
        });
    }

    provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext): ProviderResult<CompletionItem[]> {
        if (!this.htmlDocument) {
            this.htmlDocument = new HTMLDocument(document);
        } else {
            this.htmlDocument.changeDocument(document);
        }

        if (this.htmlDocument.isInAttributeValue({ column: position.character, row: position.line }, "class")) {
            return this.htmlDocument.getAllCompletionItems();
        }
    }
}
