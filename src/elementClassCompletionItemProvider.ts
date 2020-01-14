import * as fs from "fs";
import * as path from "path";
import * as Parser from "tree-sitter";
import * as CSS from "tree-sitter-css";
import * as HTML from "tree-sitter-html";
import { CancellationToken, CompletionContext, CompletionItem, CompletionItemKind, CompletionItemProvider, Position, TextDocument } from "vscode";

export class ElementClassCompletionItemProvider implements CompletionItemProvider {
    private parser = new Parser();

    async provideCompletionItems(document: TextDocument, position: Position, _token: CancellationToken, _context: CompletionContext): Promise<CompletionItem[]> {
        try {
            const code = document.getText();

            this.parser.setLanguage(HTML);
            const htmlTree = this.parser.parse(code);

            if (!isInAttribute(htmlTree, position, "class")) {
                return [];
            }

            const ranges: Parser.Range[] = htmlTree.rootNode.descendantsOfType("style_element").map(node => {
                let cssNode = node.child(1) as Parser.SyntaxNode;
                return {
                    startPosition: cssNode.startPosition,
                    endPosition: cssNode.endPosition,
                    startIndex: cssNode.startIndex,
                    endIndex: cssNode.endIndex
                };
            });

            this.parser.setLanguage(CSS);
            const cssTree = this.parser.parse(code, undefined, {
                includedRanges: ranges
            });

            const items = cssAnalysis(cssTree, document.fileName);

            for (let node of htmlTree.rootNode.descendantsOfType("tag_name")) {
                if (node.text === "link") {
                    let attributeValue = node.parent?.descendantsOfType("attribute_name").find(n => n.text === "href")?.parent?.descendantsOfType("attribute_value")[0]?.text;
                    if (attributeValue) {
                        items.push.apply(items, await linkingCSS(document.uri.fsPath, attributeValue));
                    }
                }
            }
            return items;

        } catch (err) {
            console.error(err);
            return [];
        }
    }
}

/**
 * 光标是否在属性内
 * @param htmlTree
 * @param position
 * @param attributeName
 */
function isInAttribute(htmlTree: Parser.Tree, position: Position, attributeName: string): boolean {
    let node = htmlTree.rootNode.descendantForPosition({ column: position.character, row: position.line }).parent;
    if (node?.type === "quoted_attribute_value" && position.character > node.startPosition.column) {
        return node.parent?.firstChild?.text === attributeName;
    } else {
        return false;
    }
}

/**
 * 返回文档链接的css完成项
 * @param fsPath 文档地址
 * @param url 链接地址
 */
function linkingCSS(fsPath: string, url: string): Promise<CompletionItem[]> {
    if (url.substring(0, 4) === "http") {
        return remoteCSS(url);
    } else {
        return path.isAbsolute(url)
            ? localCSS(url)
            : localCSS(path.resolve(fsPath, `../${url}`));
    }
}

async function remoteCSS(url: string): Promise<CompletionItem[]> {
    return [];
}

async function localCSS(url: string): Promise<CompletionItem[]> {
    try {
        const code = await new Promise<string>((resolve, reject) => {
            fs.readFile(url, (err, data) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(data.toString());
                }
            });
        });

        const parser = new Parser();
        parser.setLanguage(CSS);

        const tree = parser.parse(code);
        return cssAnalysis(tree, url);
    } catch (err) {
        console.error(err);
        return [];
    }
}

/**
 * css文件分析
 * @param cssTree
 * @param fileName
 */
function cssAnalysis(cssTree: Parser.Tree, fileName: string): CompletionItem[] {
    const obj: any = {};
    const completionItems = <CompletionItem[]>[];
    cssTree.rootNode.descendantsOfType("class_selector").forEach(node => {
        let className = node.lastChild?.text;
        if (className && !obj[className]) {
            obj[className] = 1;
            completionItems.push({ label: className, detail: fileName, kind: CompletionItemKind.Class });
        }
    });
    return completionItems;
}
