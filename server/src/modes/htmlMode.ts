import {
    CompletionItem,
    CompletionItemKind,
    LanguageService as CSSLanguageService,
    Position,
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
import * as nodeURL from "url";

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
                        let completionItems = parse(
                            cssStylesheets.get(embedded),
                            "Embedded"
                        );

                        for (const url of urls.get(document)) {
                            const linked = documentLinks.get(url);
                            if (linked) {
                                completionItems = completionItems.concat(
                                    parse(
                                        cssStylesheets.get(linked.doc),
                                        linked.info
                                    )
                                );
                            }
                        }

                        return completionItems;
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

function parse(cssStylesheets: any, info: string): CompletionItem[] {
    const completionItems = <CompletionItem[]>[];
    const completionItemsCache: {
        [label: string]: CompletionItem;
    } = {};

    cssStylesheets.accept((node: any) => {
        if (node.type === 14) {
            const label = node.getText().substr(1);
            if (!completionItemsCache[label]) {
                completionItemsCache[label] = {
                    label: label,
                    kind: CompletionItemKind.Class,
                    detail: info,
                };
            }
            return false;
        }
        return true;
    });

    for (const label in completionItemsCache) {
        const item = completionItemsCache[label];
        completionItems.push(item);
    }
    return completionItems;
}
