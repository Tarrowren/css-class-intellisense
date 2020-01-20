import request = require("request");
import { CompletionItem, CompletionItemKind, DiagnosticSeverity, Position, Range, TextDocument, workspace } from "vscode";
import { CSSDoc } from "./CSSDoc";
import { Doc, DocAnalysis } from "./Doc";
import { LinkingLinter } from "./LinkingLinter";
import Parser = require("tree-sitter");
import path = require("path");
import HTML = require("tree-sitter-html");
import CSS = require("tree-sitter-css");

export class HTMLDoc extends Doc implements DocAnalysis {
    private htmlTree: Parser.Tree;
    private timeout: NodeJS.Timeout | null | undefined;
    /**
     * key: url, value: CSSDoc
     */
    private localMap: any = {};
    /**
     * key: url, value: CompletionItem[]
     */
    private remoteMap: any = {};
    /**
     * key: url, value: 1
     */
    private downingMap: any = {};

    constructor(private linter: LinkingLinter, document: TextDocument, parser: Parser) {
        super(document, parser);
        const code = this.document.getText();

        this.parser.setLanguage(HTML);
        this.htmlTree = this.parser.parse(code);

        const ranges = this.embeddingCSSRanges();
        if (ranges.length > 0) {
            this.parser.setLanguage(CSS);
            this.cssTree = this.parser.parse(code, null, { includedRanges: ranges });
        } else {
            this.cssTree = null;
        }

        this.linkingCSSMap();
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

    private async linkingCSSMap(): Promise<void> {
        this.linter.changeDiagnostics(this.document.uri);
        const newLocalMap: any = {};
        const newRemoteMap: any = {};
        try {
            for (const node of this.htmlTree.rootNode.descendantsOfType("element")) {
                if (node.firstChild?.firstNamedChild?.text === "link") {
                    const hrefNode = node.firstChild.namedChildren.find(n => n.firstChild?.text === "href" && n.childCount > 1)?.lastChild?.firstNamedChild;
                    if (hrefNode) {
                        const hrefValue = hrefNode.text.trim();
                        if (hrefValue.substring(0, 4) === "http") {
                            if (this.remoteMap[hrefValue]) {
                                newRemoteMap[hrefValue] = this.remoteMap[hrefValue];
                                continue;
                            }
                            try {
                                newRemoteMap[hrefValue] = await this.remoteCSS(hrefValue);
                            } catch (err) {
                                this.linter.changeDiagnostics(this.document.uri, {
                                    range: new Range(point2Position(hrefNode.startPosition), point2Position(hrefNode.endPosition)),
                                    message: err.message,
                                    severity: DiagnosticSeverity.Error
                                });
                            }
                        } else {
                            if (this.localMap[hrefValue]) {
                                newLocalMap[hrefValue] = this.localMap[hrefValue];
                                continue;
                            }
                            const url = path.normalize(hrefValue);
                            try {
                                newLocalMap[hrefValue] = path.isAbsolute(url)
                                    ? await this.localCSS(url)
                                    : await this.localCSS(path.join(this.document.uri.fsPath, `../${url}`));
                            } catch (err) {
                                this.linter.changeDiagnostics(this.document.uri, {
                                    range: new Range(point2Position(hrefNode.startPosition), point2Position(hrefNode.endPosition)),
                                    message: err.message,
                                    severity: DiagnosticSeverity.Error
                                });
                            }
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

    private async localCSS(url: string): Promise<CSSDoc> {
        const doc = await workspace.openTextDocument(url);
        return new CSSDoc(doc, this.parser);
    }

    private async remoteCSS(url: string): Promise<CompletionItem[]> {
        const code = await new Promise<string>((resolve, reject) => {
            request(url, (err, resp, body) => {
                if (err) {
                    reject(err);
                }
                if (resp.statusCode === 200) {
                    resolve(body);
                } else {
                    reject(Error(`Response (${resp.statusMessage})`));
                }
            });
        });
        this.parser.setLanguage(CSS);
        const tree = this.parser.parse(code);

        const completionItems = <CompletionItem[]>[];
        const obj: any = {};
        tree.rootNode.descendantsOfType("class_selector").forEach(node => {
            const className = node.lastChild?.text;
            if (className && !obj[className]) {
                obj[className] = 1;
                completionItems.push({ label: className, detail: url, kind: CompletionItemKind.Class });
            }
        });
        return completionItems;
    }

    private clearTimeout() {
        if (this.timeout) {
            clearTimeout(this.timeout);
        }
        this.timeout = null;
    }

    getCompletionItems(): CompletionItem[] {
        let completionItems = this.cssClassAnalysis();
        for (const key in this.localMap) {
            completionItems = completionItems.concat((this.localMap[key] as CSSDoc).getCompletionItems());
        }
        for (const key in this.remoteMap) {
            completionItems = completionItems.concat(this.remoteMap[key]);
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
        this.clearTimeout();
        this.document = document;
        const code = this.document.getText();

        this.parser.setLanguage(HTML);
        this.htmlTree = this.parser.parse(code);

        const ranges = this.embeddingCSSRanges();
        if (ranges.length > 0) {
            this.parser.setLanguage(CSS);
            this.cssTree = this.parser.parse(code, null, { includedRanges: ranges });
        } else {
            this.cssTree = null;
        }

        this.linkingCSSMap();
    }

    /**
     * 修改树
     * @param delta
     */
    editTree(delta: Parser.Edit): void {
        this.clearTimeout();

        this.htmlTree.edit(delta);
        this.cssTree?.edit(delta);

        this.timeout = setTimeout(() => {
            this.parser.setLanguage(HTML);
            this.htmlTree = this.parser.parse(this.document.getText(), this.htmlTree);

            const ranges = this.embeddingCSSRanges();
            if (ranges.length > 0) {
                this.parser.setLanguage(CSS);
                this.cssTree = this.parser.parse(this.document.getText(), this.cssTree, { includedRanges: ranges });
            } else {
                this.cssTree = null;
            }
            this.linkingCSSMap();
        }, 500);
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

function point2Position(point: Parser.Point): Position {
    return new Position(point.row, point.column);
}
