import {
    LanguageService,
    Position,
    Range,
    TextDocument,
    TokenType,
} from "vscode-html-languageservice";

export interface LanguageRange extends Range {
    languageId: string | undefined;
    attributeValue?: boolean;
}

export interface HTMLDocumentRegions {
    getEmbeddedDocument(
        languageId: string,
        ignoreAttributeValues?: boolean
    ): TextDocument;
    getLanguageRanges(range: Range): LanguageRange[];
    getLanguageAtPosition(position: Position): string | undefined;
    getLanguagesInDocument(): string[];
    getLinkingCSSUrl(): string[];
    getHTMLClass(): string[];
    getHTMLID(): string[];
}

export const CSS_STYLE_RULE = "__";

interface EmbeddedRegion {
    languageId: string | undefined;
    start: number;
    end: number;
    attributeValue?: boolean;
}

export function getDocumentRegions(
    languageService: LanguageService,
    document: TextDocument
): HTMLDocumentRegions {
    let regions: EmbeddedRegion[] = [];
    let urls: string[] = [];
    let htmlClasses: string[] = [];
    let htmlID: string[] = [];
    let scanner = languageService.createScanner(document.getText());
    let lastTagName = "";
    let lastAttributeName: string | null = null;
    let relHref = { rel: "", href: "" };
    let token = scanner.scan();
    while (token !== TokenType.EOS) {
        switch (token) {
            case TokenType.StartTag:
                lastTagName = scanner.getTokenText();
                lastAttributeName = null;
                break;
            case TokenType.Styles:
                regions.push({
                    languageId: "css",
                    start: scanner.getTokenOffset(),
                    end: scanner.getTokenEnd(),
                });
                break;
            case TokenType.AttributeName:
                lastAttributeName = scanner.getTokenText();
                break;
            case TokenType.AttributeValue:
                if (lastTagName.toLowerCase() === "link") {
                    if (lastAttributeName === "rel") {
                        const value = scanner.getTokenText();
                        if (value.length > 2) {
                            relHref.rel = value.substr(1, value.length - 2);
                        }
                    } else if (lastAttributeName === "href") {
                        const value = scanner.getTokenText();
                        if (value.length > 2) {
                            relHref.href = value.substr(1, value.length - 2);
                        }
                    }
                }
                if (lastAttributeName === "class") {
                    let value = scanner.getTokenText();
                    value = value.substr(1, value.length - 2).trim();
                    if (value.length > 0) {
                        htmlClasses = htmlClasses.concat(value.split(/\s+/));
                    }
                } else if (lastAttributeName === "id") {
                    const value = scanner.getTokenText();
                    if (value.length > 2) {
                        htmlID.push(value.substr(1, value.length - 2));
                    }
                }
                lastAttributeName = null;
                break;
            case TokenType.StartTagSelfClose:
            case TokenType.StartTagClose:
                if (
                    relHref.href !== "" &&
                    (relHref.rel === "" || relHref.rel === "stylesheet")
                ) {
                    urls.push(relHref.href);
                }
                relHref = { rel: "", href: "" };
                break;
        }
        token = scanner.scan();
    }
    return {
        getLanguageRanges: (range: Range) =>
            getLanguageRanges(document, regions, range),
        getEmbeddedDocument: (
            languageId: string,
            ignoreAttributeValues: boolean
        ) =>
            getEmbeddedDocument(
                document,
                regions,
                languageId,
                ignoreAttributeValues
            ),
        getLanguageAtPosition: (position: Position) =>
            getLanguageAtPosition(document, regions, position),
        getLanguagesInDocument: () => getLanguagesInDocument(document, regions),
        getLinkingCSSUrl: () => urls,
        getHTMLClass: () => htmlClasses,
        getHTMLID: () => htmlID,
    };
}

function getLanguageRanges(
    document: TextDocument,
    regions: EmbeddedRegion[],
    range: Range
): LanguageRange[] {
    let result: LanguageRange[] = [];
    let currentPos = range ? range.start : Position.create(0, 0);
    let currentOffset = range ? document.offsetAt(range.start) : 0;
    let endOffset = range
        ? document.offsetAt(range.end)
        : document.getText().length;
    for (let region of regions) {
        if (region.end > currentOffset && region.start < endOffset) {
            let start = Math.max(region.start, currentOffset);
            let startPos = document.positionAt(start);
            if (currentOffset < region.start) {
                result.push({
                    start: currentPos,
                    end: startPos,
                    languageId: "html",
                });
            }
            let end = Math.min(region.end, endOffset);
            let endPos = document.positionAt(end);
            if (end > region.start) {
                result.push({
                    start: startPos,
                    end: endPos,
                    languageId: region.languageId,
                    attributeValue: region.attributeValue,
                });
            }
            currentOffset = end;
            currentPos = endPos;
        }
    }
    if (currentOffset < endOffset) {
        let endPos = range ? range.end : document.positionAt(endOffset);
        result.push({
            start: currentPos,
            end: endPos,
            languageId: "html",
        });
    }
    return result;
}

function getLanguagesInDocument(
    _document: TextDocument,
    regions: EmbeddedRegion[]
): string[] {
    let result = [];
    for (let region of regions) {
        if (region.languageId && result.indexOf(region.languageId) === -1) {
            result.push(region.languageId);
            if (result.length === 3) {
                return result;
            }
        }
    }
    result.push("html");
    return result;
}

function getLanguageAtPosition(
    document: TextDocument,
    regions: EmbeddedRegion[],
    position: Position
): string | undefined {
    let offset = document.offsetAt(position);
    for (let region of regions) {
        if (region.start <= offset) {
            if (offset <= region.end) {
                return region.languageId;
            }
        } else {
            break;
        }
    }
    return "html";
}

function getEmbeddedDocument(
    document: TextDocument,
    contents: EmbeddedRegion[],
    languageId: string,
    ignoreAttributeValues: boolean
): TextDocument {
    let currentPos = 0;
    let oldContent = document.getText();
    let result = "";
    let lastSuffix = "";
    for (let c of contents) {
        if (
            c.languageId === languageId &&
            (!ignoreAttributeValues || !c.attributeValue)
        ) {
            result = substituteWithWhitespace(
                result,
                currentPos,
                c.start,
                oldContent,
                lastSuffix,
                getPrefix(c)
            );
            result += oldContent.substring(c.start, c.end);
            currentPos = c.end;
            lastSuffix = getSuffix(c);
        }
    }
    result = substituteWithWhitespace(
        result,
        currentPos,
        oldContent.length,
        oldContent,
        lastSuffix,
        ""
    );
    return TextDocument.create(
        document.uri,
        languageId,
        document.version,
        result
    );
}

function getPrefix(c: EmbeddedRegion) {
    if (c.attributeValue) {
        switch (c.languageId) {
            case "css":
                return CSS_STYLE_RULE + "{";
        }
    }
    return "";
}
function getSuffix(c: EmbeddedRegion) {
    if (c.attributeValue) {
        switch (c.languageId) {
            case "css":
                return "}";
            case "javascript":
                return ";";
        }
    }
    return "";
}

function substituteWithWhitespace(
    result: string,
    start: number,
    end: number,
    oldContent: string,
    before: string,
    after: string
) {
    let accumulatedWS = 0;
    result += before;
    for (let i = start + before.length; i < end; i++) {
        let ch = oldContent[i];
        if (ch === "\n" || ch === "\r") {
            accumulatedWS = 0;
            result += ch;
        } else {
            accumulatedWS++;
        }
    }
    result = append(result, " ", accumulatedWS - after.length);
    result += after;
    return result;
}

function append(result: string, str: string, n: number): string {
    while (n > 0) {
        if (n & 1) {
            result += str;
        }
        n >>= 1;
        str += str;
    }
    return result;
}
