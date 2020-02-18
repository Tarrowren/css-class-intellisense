import * as Parser from "tree_sitter";
import {
    CancellationToken,
    CompletionContext,
    CompletionItem,
    CompletionItemProvider,
    Position,
    ProviderResult,
    TextDocument,
    TextDocumentChangeEvent,
    TextDocumentContentChangeEvent
} from "vscode";
import { HTMLDoc } from "./HTMLDoc";
import { LinkingLinter } from "./LinkingLinter";

export class CCICompletionItemProvider implements CompletionItemProvider {
    private htmlDoc: HTMLDoc | null = null;
    private parser = new Parser();

    constructor(private linter: LinkingLinter, private cachePath: string) {}

    openTextDocument(doc: TextDocument): void {
        if (doc.languageId === "html") {
            if (this.htmlDoc) {
                this.htmlDoc.changeDoc(doc);
            } else {
                this.htmlDoc = new HTMLDoc(
                    this.linter,
                    doc,
                    this.parser,
                    this.cachePath
                );
            }
        }
    }

    changeTextDocument(event: TextDocumentChangeEvent): void {
        if (!this.htmlDoc) {
            if (event.document.languageId === "html") {
                this.htmlDoc = new HTMLDoc(
                    this.linter,
                    event.document,
                    this.parser,
                    this.cachePath
                );
            }
        } else {
            if (event.document.languageId === "html") {
                if (this.htmlDoc.isSameDoc(event.document)) {
                    for (const e of event.contentChanges) {
                        this.htmlDoc.editTree(
                            changeEvent2Edit(e, this.htmlDoc)
                        );
                    }
                } else {
                    this.htmlDoc.changeDoc(event.document);
                }
            } else if (event.document.languageId === "css") {
                const cssDoc = this.htmlDoc.getLocalCSSDoc(event.document);
                if (cssDoc) {
                    for (const e of event.contentChanges) {
                        cssDoc.editTree(changeEvent2Edit(e, this.htmlDoc));
                    }
                }
            }
        }
    }

    setConfiguration(cachePath: string): void {
        this.cachePath = cachePath;
        this.htmlDoc?.setConfiguration(cachePath);
    }

    provideCompletionItems(
        document: TextDocument,
        position: Position,
        _token: CancellationToken,
        _context: CompletionContext
    ): ProviderResult<CompletionItem[]> {
        if (!this.htmlDoc) {
            this.htmlDoc = new HTMLDoc(
                this.linter,
                document,
                this.parser,
                this.cachePath
            );
        }
        if (
            this.htmlDoc.isInAttributeValue(
                { column: position.character, row: position.line },
                "class"
            )
        ) {
            return this.htmlDoc.getCompletionItems();
        }
    }
}

function changeEvent2Edit(
    e: TextDocumentContentChangeEvent,
    htmlDoc: HTMLDoc
): Parser.Edit {
    return {
        newEndIndex: e.rangeOffset + e.text.length,
        newEndPosition: htmlDoc.pointAt(e.rangeOffset + e.text.length),
        oldEndIndex: e.rangeOffset + e.rangeLength,
        oldEndPosition: {
            column: e.range.end.character,
            row: e.range.end.line
        },
        startIndex: e.rangeOffset,
        startPosition: {
            column: e.range.start.character,
            row: e.range.start.line
        }
    };
}
