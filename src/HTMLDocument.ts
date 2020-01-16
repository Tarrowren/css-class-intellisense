import * as fs from "fs";
import * as path from "path";
import * as Parser from "tree-sitter";
import * as CSS from "tree-sitter-css";
import * as HTML from "tree-sitter-html";
import { CompletionItem, CompletionItemKind, TextDocument } from "vscode";

export class HTMLDocument {
    private parser = new Parser();
    private htmlTree: Parser.Tree;
    private cssTree: Parser.Tree | null;

    constructor(private document: TextDocument) {
        this.parser.setLanguage(HTML);
        this.htmlTree = this.parser.parse(document.getText());

        const ranges = this.embeddingCSSRanges();
        if (ranges.length > 0) {
            this.parser.setLanguage(CSS);
            this.cssTree = this.parser.parse(document.getText(), null, {
                includedRanges: ranges
            });
        } else {
            this.cssTree = null;
        }
    }

    private embeddingCSSRanges(): Parser.Range[] {
        const ranges = <Parser.Range[]>[];
        this.htmlTree.rootNode.descendantsOfType("style_element").forEach(n => {
            const node = n.child(1);
            if (node && node.endIndex > node.startIndex) {
                ranges.push({
                    startPosition: node.startPosition,
                    endPosition: node.endPosition,
                    startIndex: node.startIndex,
                    endIndex: node.endIndex
                });
            }
        });
        return ranges;
    }

    private async linkingCSS(): Promise<CompletionItem[]> {
        const completionItems = <CompletionItem[]>[];

        for (const node of this.htmlTree.rootNode.descendantsOfType("element")) {
            if (node.firstChild?.child(1)?.text === "link") {
                for (const n of node.firstChild.children) {
                    if (n.firstChild?.text === "href") {
                        const url = n.descendantsOfType("attribute_value")[0].text;
                        if (url) {
                            if (url.substring(0, 4) === "http") {
                                completionItems.push.apply(completionItems, await this.remoteLinkingCSS(url));
                            } else {
                                const local = path.isAbsolute(url)
                                    ? this.localLinkingCSS(url)
                                    : this.localLinkingCSS(path.resolve(this.document.uri.fsPath, `../${url}`));
                                completionItems.push.apply(completionItems, await local);
                            }
                        }
                    }
                }
            }
        }
        return completionItems;
    }

    private async localLinkingCSS(url: string): Promise<CompletionItem[]> {
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
            return cssClassAnalysis(tree, url);
        } catch (err) {
            console.error(err);
            return [];
        }
    }

    private async remoteLinkingCSS(url: string): Promise<CompletionItem[]> {
        return [];
    }

    private embeddingCSS(): CompletionItem[] {
        return this.cssTree
            ? cssClassAnalysis(this.cssTree, this.document.fileName)
            : [];
    }

    /**
     * 是否是同一文档
     * @param document
     */
    isSameDocument(document: TextDocument): boolean {
        return this.document === document;
    }

    /**
     * 更换文档
     * @param document
     */
    changeDocument(document: TextDocument) {
        if (this.isSameDocument(document)) {
            return;
        }
        this.document = document;

        this.parser.setLanguage(HTML);
        this.htmlTree = this.parser.parse(document.getText());

        const ranges = this.embeddingCSSRanges();
        if (ranges.length > 0) {
            this.parser.setLanguage(CSS);
            this.cssTree = this.parser.parse(document.getText(), null, {
                includedRanges: ranges
            });
        } else {
            this.cssTree = null;
        }
    }

    /**
     * 偏移转位置
     * @param offset
     */
    pointAt(offset: number): Parser.Point {
        const p = this.document.positionAt(offset);
        return {
            column: p.character,
            row: p.line
        };
    }

    /**
     * 修改树
     * @param delta
     */
    editTree(delta: Parser.Edit) {
        this.htmlTree.edit(delta);
        this.parser.setLanguage(HTML);
        this.htmlTree = this.parser.parse(this.document.getText(), this.htmlTree);

        const ranges = this.embeddingCSSRanges();
        if (ranges.length > 0) {
            if (this.cssTree) {
                this.cssTree.edit(delta);
            }
            this.parser.setLanguage(CSS);
            this.cssTree = this.parser.parse(this.document.getText(), this.cssTree, { includedRanges: ranges });
        } else {
            this.cssTree = null;
        }
    }

    /**
     * 是否在编辑某属性值
     * @param point
     * @param attributeName
     */
    isInAttributeValue(point: Parser.Point, attributeName: string): boolean {
        const node = this.htmlTree.rootNode.descendantForPosition(point).parent;
        if (node?.type === "quoted_attribute_value" && point.column > node.startPosition.column) {
            return node.parent?.firstChild?.text === attributeName;
        } else {
            return false;
        }
    }

    /**
     * 获取所有完成项
     */
    async getAllCompletionItems(): Promise<CompletionItem[]> {
        return this.embeddingCSS().concat(await this.linkingCSS());
    }
}

/**
 * css class分析
 * @param cssTree
 * @param fileName
 */
function cssClassAnalysis(cssTree: Parser.Tree, fileName: string): CompletionItem[] {
    const obj: any = {};
    const completionItems = <CompletionItem[]>[];
    cssTree.rootNode.descendantsOfType("class_selector").forEach(node => {
        const className = node.lastChild?.text;
        if (className && !obj[className]) {
            obj[className] = 1;
            completionItems.push({ label: className, detail: fileName, kind: CompletionItemKind.Class });
        }
    });
    return completionItems;
}