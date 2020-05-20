import {
    CompletionItem,
    CompletionItemKind,
    LanguageService as CSSLanguageService,
    Position,
    Range,
    Stylesheet,
    TextDocument,
    TextEdit,
} from "vscode-css-languageservice";
import { HTMLDocumentRegions } from "../embeddedSupport";
import {
    getLanguageModelCache,
    LanguageModelCache,
} from "../languageModelCache";
import { LanguageMode } from "../languageModes";

export function getCSSMode(
    cssLanguageService: CSSLanguageService,
    documentRegions: LanguageModelCache<HTMLDocumentRegions>
): LanguageMode {
    const embeddedCSSDocuments = getLanguageModelCache<TextDocument>(
        10,
        60,
        (document) => documentRegions.get(document).getEmbeddedDocument("css")
    );
    const cssStylesheets = getLanguageModelCache<Stylesheet>(
        10,
        60,
        (document) => cssLanguageService.parseStylesheet(document)
    );
    const htmlClasses = getLanguageModelCache<string[]>(10, 60, (document) =>
        documentRegions.get(document).getHTMLClass()
    );

    return {
        getId() {
            return "css";
        },
        doComplete(document: TextDocument, position: Position) {
            const completionItems: CompletionItem[] = [];
            const embedded = embeddedCSSDocuments.get(document);
            const offset = embedded.offsetAt(position);
            const stylesheeat = cssStylesheets.get(embedded);

            let node = getNodeAtOffset(stylesheeat, offset);
            if (!!node?.parent?.declarations) {
                return completionItems;
            }
            if (node?.type === 1) {
                node = node.parent;
            }

            const completionItemsCache: {
                [selector: string]: CompletionItem;
            } = {};

            for (const selector of htmlClasses.get(document)) {
                if (!completionItemsCache[selector]) {
                    completionItemsCache[selector] = {
                        label: "." + selector,
                        textEdit: TextEdit.replace(
                            editRange(node, embedded, position),
                            "." + selector
                        ),
                        kind: CompletionItemKind.EnumMember,
                        detail: "Embedded",
                    };
                }
            }

            for (const selector in completionItemsCache) {
                completionItems.push(completionItemsCache[selector]);
            }

            return completionItems;
        },

        onDocumentRemoved(document: TextDocument) {
            embeddedCSSDocuments.onDocumentRemoved(document);
            cssStylesheets.onDocumentRemoved(document);
            htmlClasses.onDocumentRemoved(document);
        },
        dispose() {
            embeddedCSSDocuments.dispose();
            cssStylesheets.dispose();
            htmlClasses.dispose();
        },
    };
}

function getNodeAtOffset(node: any, offset: number) {
    let candidate: any = null;
    if (!node || offset < node.offset || offset > node.end) {
        return null;
    }

    node.accept((n: any) => {
        if (n.offset === -1 && n.length === -1) {
            return true;
        }
        if (n.offset <= offset && n.end >= offset) {
            if (!candidate) {
                candidate = n;
            } else if (n.length <= candidate.length) {
                candidate = n;
            }
            return true;
        }
        return false;
    });
    return candidate;
}

function editRange(node: any, textDocument: TextDocument, position: Position) {
    if (node) {
        var end =
            node.end !== -1 ? textDocument.positionAt(node.end) : position;
        var start = textDocument.positionAt(node.offset);
        if (start.line === end.line) {
            return Range.create(start, end);
        }
    }
    return Range.create(position, position);
}
