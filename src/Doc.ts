import { CompletionItem, CompletionItemKind, TextDocument } from "vscode";
import Parser = require("tree-sitter");

export interface DocAnalysis {
    getCompletionItems(): CompletionItem[];

    editTree(delta: Parser.Edit): void;
}

export abstract class Doc {
    protected cssTree: Parser.Tree | null = null;

    constructor(protected document: TextDocument, protected parser: Parser) { }

    isSameDoc(document: TextDocument): boolean {
        return this.document === document;
    }

    protected cssClassAnalysis(): CompletionItem[] {
        return cssTreeAnalysis(this.cssTree, this.document.fileName);
    }
}

export function cssTreeAnalysis(tree: Parser.Tree | null, detail: string): CompletionItem[] {
    if (tree) {
        const completionItems = <CompletionItem[]>[];
        const obj: any = {};
        tree.rootNode.descendantsOfType("class_selector").forEach(node => {
            const className = node.lastChild?.text;
            if (className && !obj[className]) {
                obj[className] = 1;
                completionItems.push({ label: className, detail: detail, kind: CompletionItemKind.Class });
            }
        });
        return completionItems;
    } else {
        return [];
    }
}
