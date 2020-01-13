import * as Parser from "tree-sitter";
import * as CSS from "tree-sitter-css";
import * as HTML from "tree-sitter-html";
import { CancellationToken, CompletionContext, CompletionItem, CompletionItemKind, CompletionItemProvider, Position, ProviderResult, TextDocument } from "vscode";

export class ElementClassCompletionItemProvider implements CompletionItemProvider {
    private parser = new Parser();
    private htmlTree: Parser.Tree | undefined;
    private cssTree: Parser.Tree | undefined;

    provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext): ProviderResult<CompletionItem[]> {
        try {
            const code = document.getText();
            this.parser.setLanguage(HTML);
            this.htmlTree = this.parser.parse(code);

            if (!isInAttribute(this.htmlTree.rootNode, position, "class")) {
                return;
            }

            let ranges = this.htmlTree.rootNode.descendantsOfType("style_element").map(node => {
                let cssNode = node.children.find(n => n.type === "raw_text");
                if (cssNode) {
                    return {
                        startPosition: cssNode.startPosition,
                        endPosition: cssNode.endPosition,
                        startIndex: cssNode.startIndex,
                        endIndex: cssNode.endIndex
                    } as Parser.Range;
                } else {
                    throw new Error("have no css raw text");
                }
            });

            this.parser.setLanguage(CSS);
            this.cssTree = this.parser.parse(code, undefined, {
                includedRanges: ranges
            });

            return this.cssTree.rootNode.descendantsOfType("class_selector").map(node => {
                return node.children.map(n => {
                    if (n.type === "class_name") {
                        return {
                            label: n.text,
                            detail: document.fileName,
                            kind: CompletionItemKind.Class
                        } as CompletionItem;
                    }
                }).filter(n => n !== undefined) as CompletionItem[];
            }).reduce((a, b) => a.concat(b));

        } catch (err) {
            console.error(err);
        }
    }
}

/**
 * 光标是否在属性内
 * @param rootNode
 * @param position
 * @param attributeName
 */
function isInAttribute(rootNode: Parser.SyntaxNode, position: Position, attributeName: string): boolean {
    let node = rootNode.descendantForPosition({ column: position.character, row: position.line }).parent;
    if (node?.type === "quoted_attribute_value" && position.character > node.startPosition.column) {
        let pNode = node.parent;
        if (pNode?.type === "attribute" && pNode.children.find(n => n.type === "attribute_name" && n.text === attributeName)) {
            return true;
        } else {
            return false;
        }
    } else {
        return false;
    }
}
