import * as Parser from "tree-sitter";
import { CancellationToken, CompletionContext, CompletionItem, CompletionItemProvider, Position, ProviderResult, TextDocument, workspace } from "vscode";
import { HTMLDoc } from "./Doc";

export class CSSClassCompletionItemProvider implements CompletionItemProvider {
    private htmlDoc: HTMLDoc | undefined;

    constructor(private parser: Parser) {
        workspace.onDidChangeTextDocument(event => {
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
            }
        });
    }

    provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext): ProviderResult<CompletionItem[]> {
        // console.time("use");
        if (this.htmlDoc) {
            this.htmlDoc.changeDoc(document);
        } else {
            this.htmlDoc = new HTMLDoc(document, this.parser);
        }
        let items;
        if (this.htmlDoc.isInAttributeValue({ column: position.character, row: position.line }, "class")) {
            items = this.htmlDoc.getCompletionItems();
        }
        // console.timeEnd("use");
        return items;
    }
}
