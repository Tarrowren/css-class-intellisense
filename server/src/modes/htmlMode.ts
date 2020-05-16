import {
    CompletionItem,
    CompletionItemKind,
    LanguageService as CSSLanguageService,
    Position,
    Range,
    Stylesheet,
    TextDocument,
} from "vscode-css-languageservice";
import {
    HTMLDocument,
    LanguageService as HTMLLanguageService,
    TokenType,
} from "vscode-html-languageservice";
import { HTMLDocumentRegions } from "../embeddedSupport";
import { ImportDocCache } from "../importDocCache";
import {
    getLanguageModelCache,
    LanguageModelCache,
} from "../languageModelCache";
import { LanguageMode } from "../languageModes";

export function getHTMLMode(
    htmlLanguageService: HTMLLanguageService,
    cssLanguageService: CSSLanguageService,
    documentRegions: LanguageModelCache<HTMLDocumentRegions>,
    documentLinks: ImportDocCache
): LanguageMode {
    const htmlDocuments = getLanguageModelCache<HTMLDocument>(
        10,
        60,
        (document) => htmlLanguageService.parseHTMLDocument(document)
    );
    const embeddedCSSDocuments = getLanguageModelCache<TextDocument>(
        10,
        60,
        (document) => documentRegions.get(document).getEmbeddedDocument("css")
    );
    const urls = getLanguageModelCache<string[]>(10, 60, (document) =>
        documentRegions.get(document).getLinkingCSSUrl()
    );
    const cssStylesheets = getLanguageModelCache<Stylesheet>(
        10,
        60,
        (document) => cssLanguageService.parseStylesheet(document)
    );

    return {
        getId() {
            return "html";
        },
        doComplete(document: TextDocument, position: Position) {
            const offset = document.offsetAt(position);
            const node = htmlDocuments.get(document).findNodeAt(offset);
            if (node.attributes && node.attributes["class"]) {
                const scanner = htmlLanguageService.createScanner(
                    document.getText(),
                    node.start
                );

                let tokenType = scanner.scan();
                let lastAttributeName: string | undefined = undefined;

                while (
                    tokenType !== TokenType.EOS &&
                    offset >= scanner.getTokenEnd()
                ) {
                    tokenType = scanner.scan();

                    if (tokenType === TokenType.AttributeName) {
                        lastAttributeName = scanner.getTokenText();
                    } else if (
                        tokenType === TokenType.AttributeValue &&
                        lastAttributeName === "class" &&
                        offset > scanner.getTokenOffset() &&
                        offset < scanner.getTokenEnd()
                    ) {
                        const embedded = embeddedCSSDocuments.get(document);
                        let completeItems = parse(
                            embedded,
                            cssStylesheets.get(embedded),
                            "Embedded"
                        );

                        for (const url of urls.get(document)) {
                            const linked = documentLinks.get(url);
                            if (linked) {
                                completeItems = completeItems.concat(
                                    parse(
                                        linked.doc,
                                        cssStylesheets.get(linked.doc),
                                        linked.info
                                    )
                                );
                            }
                        }

                        return completeItems;
                    }
                }
            }

            return [];
        },
        onDocumentRemoved(document: TextDocument) {
            htmlDocuments.onDocumentRemoved(document);
            embeddedCSSDocuments.onDocumentRemoved(document);
            urls.onDocumentRemoved(document);
            cssStylesheets.onDocumentRemoved(document);
        },
        dispose() {
            htmlDocuments.dispose();
            embeddedCSSDocuments.dispose();
            urls.dispose();
            cssStylesheets.dispose();
        },
    };
}

function parse(
    textDocument: TextDocument,
    cssStylesheets: any,
    url: string
): CompletionItem[] {
    const completeItems = <CompletionItem[]>[];
    const completeItemsCache: {
        [label: string]: CompletionItem;
    } = {};

    if (!(cssStylesheets as any).children) {
        return completeItems;
    }

    for (const stylesheet of (cssStylesheets as any).children) {
        if (stylesheet.type === 3) {
            parseCache(textDocument, stylesheet, completeItemsCache);
        } else if (stylesheet.type === 50 || stylesheet.type === 68) {
            for (const ss of stylesheet.children[1].children) {
                if (ss.type === 3) {
                    parseCache(textDocument, ss, completeItemsCache);
                }
            }
        }
    }
    for (const label in completeItemsCache) {
        const item = completeItemsCache[label];
        item.detail = url;
        completeItems.push(item);
    }
    return completeItems;
}

function parseCache(
    textDocument: TextDocument,
    stylesheet: any,
    completeItemsCache: {
        [label: string]: CompletionItem;
    }
) {
    for (const selector of stylesheet.children[0].children) {
        for (const node of selector.children[0].children) {
            if (node.nodeType === 14) {
                const label = textDocument.getText(
                    Range.create(
                        textDocument.positionAt(node.children[0].offset),
                        textDocument.positionAt(node.children[0].end)
                    )
                );

                if (!completeItemsCache[label]) {
                    completeItemsCache[label] = {
                        label: label,
                        kind: CompletionItemKind.Class,
                    };
                }
            }
        }
    }
}
