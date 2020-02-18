import * as fs from "fs";
import * as path from "path";
import * as request from "request";
import * as Parser from "tree_sitter";
import * as CSS from "tree_sitter_css";
import * as HTML from "tree_sitter_html";
import {
    CompletionItem,
    DiagnosticSeverity,
    Position,
    Range,
    TextDocument,
    Uri,
    workspace
} from "vscode";
import { CSSDoc } from "./CSSDoc";
import { cssTreeAnalysis, Doc, DocAnalysis } from "./Doc";
import { LinkingLinter } from "./LinkingLinter";

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

    constructor(
        private linter: LinkingLinter,
        document: TextDocument,
        parser: Parser,
        private cachePath: string
    ) {
        super(document, parser);
        const code = this.document.getText();

        this.parser.setLanguage(HTML);
        this.htmlTree = this.parser.parse(code);

        const ranges = this.embeddingCSSRanges();
        if (ranges.length > 0) {
            this.parser.setLanguage(CSS);
            this.cssTree = this.parser.parse(code, null, {
                includedRanges: ranges
            });
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
        const newLocalMap: any = {};
        const newRemoteMap: any = {};
        for (const node of this.htmlTree.rootNode.descendantsOfType(
            "element"
        )) {
            if (node.firstChild?.firstNamedChild?.text === "link") {
                const hrefNode = node.firstChild.namedChildren.find(
                    n => n.firstChild?.text === "href" && n.childCount > 1
                )?.lastChild?.firstNamedChild;
                if (hrefNode) {
                    const hrefValue = hrefNode.text.trim();
                    if (hrefValue.substring(0, 4) === "http") {
                        if (this.remoteMap[hrefValue]) {
                            newRemoteMap[hrefValue] = this.remoteMap[hrefValue];
                            continue;
                        }
                        if (this.downingMap[hrefValue]) {
                            continue;
                        }
                        try {
                            this.downingMap[hrefValue] = 1;
                            newRemoteMap[hrefValue] = await this.remoteCSS(
                                hrefValue
                            );
                        } catch (err) {
                            this.linter.changeDiagnostics(this.document.uri, {
                                range: new Range(
                                    point2Position(hrefNode.startPosition),
                                    point2Position(hrefNode.endPosition)
                                ),
                                message: err.message,
                                severity: DiagnosticSeverity.Error
                            });
                        } finally {
                            delete this.downingMap[hrefValue];
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
                                : await this.localCSS(
                                      path.join(
                                          this.document.uri.fsPath,
                                          `../${url}`
                                      )
                                  );
                        } catch (err) {
                            this.linter.changeDiagnostics(this.document.uri, {
                                range: new Range(
                                    point2Position(hrefNode.startPosition),
                                    point2Position(hrefNode.endPosition)
                                ),
                                message: err.message,
                                severity: DiagnosticSeverity.Error
                            });
                        }
                    }
                }
            }
        }
        this.linter.changeDiagnostics(this.document.uri);
        this.localMap = newLocalMap;
        this.remoteMap = newRemoteMap;
    }

    private async localCSS(url: string): Promise<CSSDoc> {
        const doc = await workspace.openTextDocument(url);
        return new CSSDoc(doc, this.parser);
    }

    private async remoteCSS(url: string): Promise<CompletionItem[]> {
        let code = "";
        if (this.cachePath === "") {
            code = await down(url);
        } else {
            const uri = Uri.parse(url, true);
            const docCachePath = path.join(
                this.cachePath,
                uri.authority + uri.path
            );
            try {
                code = (
                    await workspace.openTextDocument(docCachePath)
                ).getText();
            } catch {
                code = await down(url);
            }
            await fs.promises.mkdir(path.dirname(docCachePath), {
                recursive: true
            });
            await fs.promises.writeFile(docCachePath, code);
        }
        this.parser.setLanguage(CSS);
        return cssTreeAnalysis(this.parser.parse(code), url);
    }

    private clearTimeout(): void {
        if (this.timeout) {
            clearTimeout(this.timeout);
        }
        this.timeout = null;
    }

    setConfiguration(cachePath: string): void {
        this.cachePath = cachePath;
    }

    getCompletionItems(): CompletionItem[] {
        let completionItems = this.cssClassAnalysis();
        for (const key in this.localMap) {
            completionItems = completionItems.concat(
                (this.localMap[key] as CSSDoc).getCompletionItems()
            );
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
        if (
            node?.type === "quoted_attribute_value" &&
            point.column > node.startPosition.column
        ) {
            return node.parent?.firstChild?.text === attributeName;
        } else {
            return false;
        }
    }

    /**
     * 更换文档
     * @param document
     */
    changeDoc(document: TextDocument): void {
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
            this.cssTree = this.parser.parse(code, null, {
                includedRanges: ranges
            });
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
        this.parser.setLanguage(HTML);
        this.htmlTree = this.parser.parse(
            this.document.getText(),
            this.htmlTree
        );

        const ranges = this.embeddingCSSRanges();
        if (ranges.length > 0) {
            this.cssTree?.edit(delta);
            this.parser.setLanguage(CSS);
            this.cssTree = this.parser.parse(
                this.document.getText(),
                this.cssTree,
                { includedRanges: ranges }
            );
        } else {
            this.cssTree = null;
        }

        this.timeout = setTimeout(() => {
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

    /**
     * 获取Linking的本地文档的CSSDoc对象
     * @param document
     */
    getLocalCSSDoc(document: TextDocument): CSSDoc | undefined {
        for (const key in this.localMap) {
            const cssDoc = this.localMap[key] as CSSDoc;
            if (cssDoc.isSameDoc(document)) {
                return cssDoc;
            }
        }
    }
}

function point2Position(point: Parser.Point): Position {
    return new Position(point.row, point.column);
}

function down(url: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        request.get(url, (error, response, body) => {
            if (error) {
                reject(error);
            } else {
                if (response.statusCode === 200) {
                    resolve(body);
                } else {
                    reject(Error(`Response (${response.statusMessage})`));
                }
            }
        });
    });
}
