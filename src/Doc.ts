import * as path from "path";
import * as request from "request";
import * as Parser from "tree-sitter";
import * as CSS from "tree-sitter-css";
import * as HTML from "tree-sitter-html";
import { CompletionItem, CompletionItemKind, TextDocument, Uri, workspace, CallHierarchyOutgoingCall, languages } from "vscode";

export interface DocAnalysis {
    getCompletionItems(): Promise<CompletionItem[]> | CompletionItem[];
}

export abstract class Doc {
    constructor(protected document: TextDocument, protected parser: Parser) { }

    isSameDoc(document: TextDocument): boolean {
        return this.document === document;
    }
}

export class HTMLDoc extends Doc implements DocAnalysis {
    private htmlTree: Parser.Tree;
    private cssTree: Parser.Tree | null;
    /**
     * key: url, value: Promise<CSSDoc>
     */
    private localMap: any = {};
    /**
     * key: url, value: Promise<CompletionItem[]>
     */
    private remoteMap: any = {};
    /**
     * key: url, value: 1
     */
    private downingMap: any = {};

    constructor(document: TextDocument, parser: Parser) {
        super(document, parser);
        const code = this.document.getText();

        this.parser.setLanguage(HTML);
        this.htmlTree = this.parser.parse(code);

        this.linkingCSSMap();

        const ranges = this.embeddingCSSRanges();
        if (ranges.length > 0) {
            this.parser.setLanguage(CSS);
            this.cssTree = this.parser.parse(code, null, { includedRanges: ranges });
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

    private linkingCSSMap(): void {
        try {
            const newLocalMap: any = {};
            const newRemoteMap: any = {};
            for (const node of this.htmlTree.rootNode.descendantsOfType("element")) {
                if (node.firstChild?.firstNamedChild?.text === "link") {
                    let hrefValue = node.firstChild.namedChildren.find(n => n.firstChild?.text === "href" && n.childCount > 1)?.lastChild?.firstNamedChild?.text;
                    if (hrefValue) {
                        hrefValue = hrefValue.trim();
                        if (hrefValue.substring(0, 4) === "http") {
                            if (this.remoteMap[hrefValue]) {
                                newRemoteMap[hrefValue] = this.remoteMap[hrefValue];
                                continue;
                            }
                            newRemoteMap[hrefValue] = this.remoteCSS(hrefValue);
                        } else {
                            if (this.localMap[hrefValue]) {
                                newLocalMap[hrefValue] = this.localMap[hrefValue];
                                continue;
                            }
                            const url = path.normalize(hrefValue);
                            newLocalMap[hrefValue] = path.isAbsolute(url)
                                ? this.localCSS(url)
                                : this.localCSS(path.join(this.document.uri.fsPath, `../${url}`));
                        }
                    }
                }
            }
            this.localMap = newLocalMap;
            this.remoteMap = newRemoteMap;
        } catch (err) {
            console.error(err.message);
        }
    }

    private async localCSS(url: string): Promise<CSSDoc | undefined> {
        try {
            const doc = await workspace.openTextDocument(url);
            return new CSSDoc(doc, this.parser);
        } catch (err) {
            //提示
            console.error(err.message);
        }
    }

    private async remoteCSS(url: string): Promise<CompletionItem[]> {
        try {
            let a = await new Promise<string>((resolve, reject) => {
                request(url, (err, resp, body) => {
                    if (err) {
                        reject(err);
                    }
                    if (resp.statusCode === 200) {
                        resolve(body);
                    } else {
                        reject(Error(`response(${resp.statusMessage})`));
                    }
                });
            });
        }
        catch (err) {
            console.error("downing:", err.message);
        }
        return [];
    }

    async getCompletionItems(): Promise<CompletionItem[]> {
        let completionItems = <CompletionItem[]>[];
        if (this.cssTree) {
            completionItems = cssClassAnalysis(this.cssTree, this.document.fileName);
        }
        for (const key in this.localMap) {
            completionItems = completionItems.concat((await this.localMap[key] as CSSDoc).getCompletionItems());
        }
        for (const key in this.remoteMap) {
            completionItems = completionItems.concat(await this.remoteMap[key]);
        }
        return completionItems;
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
     * 更换文档
     * @param document
     */
    changeDoc(document: TextDocument) {
        if (this.isSameDoc(document)) {
            return;
        }
        this.document = document;
        const code = this.document.getText();

        this.parser.setLanguage(HTML);
        this.htmlTree = this.parser.parse(code);

        this.linkingCSSMap();

        const ranges = this.embeddingCSSRanges();
        if (ranges.length > 0) {
            this.parser.setLanguage(CSS);
            this.cssTree = this.parser.parse(code, null, { includedRanges: ranges });
        } else {
            this.cssTree = null;
        }
    }

    /**
     * 修改树
     * @param delta
     */
    editTree(delta: Parser.Edit) {
        this.htmlTree.edit(delta);
        this.parser.setLanguage(HTML);
        this.htmlTree = this.parser.parse(this.document.getText(), this.htmlTree);

        this.linkingCSSMap();

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
}

export class CSSDoc extends Doc implements DocAnalysis {
    private cssTree: Parser.Tree;

    constructor(document: TextDocument, parser: Parser) {
        super(document, parser);
        this.parser.setLanguage(CSS);
        this.cssTree = this.parser.parse(this.document.getText());
    }

    getCompletionItems(): CompletionItem[] {
        return cssClassAnalysis(this.cssTree, this.document.fileName);
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
