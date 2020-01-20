import { CompletionItem, CompletionItemKind, TextDocument } from "vscode";
import Parser = require("tree-sitter");

export interface DocAnalysis {
    getCompletionItems(): CompletionItem[];
}

export abstract class Doc {
    protected cssTree: Parser.Tree | null | undefined;

    constructor(protected document: TextDocument, protected parser: Parser) { }

    isSameDoc(document: TextDocument): boolean {
        return this.document === document;
    }

    protected cssClassAnalysis(): CompletionItem[] {
        if (this.cssTree) {
            const completionItems = <CompletionItem[]>[];
            const obj: any = {};
            this.cssTree.rootNode.descendantsOfType("class_selector").forEach(node => {
                const className = node.lastChild?.text;
                if (className && !obj[className]) {
                    obj[className] = 1;
                    completionItems.push({ label: className, detail: this.document.fileName, kind: CompletionItemKind.Class });
                }
            });
            return completionItems;
        } else {
            return [];
        }
    }
}
