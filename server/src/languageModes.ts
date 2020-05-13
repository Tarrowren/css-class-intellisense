import * as fs from "fs";
import * as nodeURL from "url";
import {
    getCSSLanguageService,
    TextDocument,
} from "vscode-css-languageservice";
import {
    CompletionItem,
    Diagnostic,
    getLanguageService as getHTMLLanguageService,
    Position,
    Range,
} from "vscode-html-languageservice";
import { getDocumentRegions, HTMLDocumentRegions } from "./embeddedSupport";
import { getImportDocCache, ImportDocCache } from "./importDocCache";
import {
    getLanguageModelCache,
    LanguageModelCache,
} from "./languageModelCache";
import { getCSSMode } from "./modes/cssMode";
import { getHTMLMode } from "./modes/htmlMode";

export interface LanguageMode {
    getId(): string;
    doValidation?: (document: TextDocument) => Diagnostic[];
    doComplete?: (
        document: TextDocument,
        position: Position
    ) => CompletionItem[] | Promise<CompletionItem[]>;
    onDocumentRemoved(document: TextDocument): void;
    dispose(): void;
}

export interface LanguageModes {
    getModeAtPosition(
        document: TextDocument,
        position: Position
    ): LanguageMode | undefined;
    getModesInRange(document: TextDocument, range: Range): LanguageModeRange[];
    getAllModes(): LanguageMode[];
    getAllModesInDocument(document: TextDocument): LanguageMode[];
    getMode(languageId: string): LanguageMode | undefined;
    onDocumentRemoved(document: TextDocument): void;
    onChangeCSSDoc(doc: TextDocument): void;
    dispose(): void;
}

export interface LanguageModeRange extends Range {
    mode: LanguageMode | undefined;
    attributeValue?: boolean;
}

export function getLanguageModes(): LanguageModes {
    const htmlLanguageService = getHTMLLanguageService();
    const cssLanguageService = getCSSLanguageService();

    const documentRegions = getLanguageModelCache<HTMLDocumentRegions>(
        10,
        60,
        (document) => getDocumentRegions(htmlLanguageService, document)
    );
    const documentLinks = getImportDocCache(10, 60, async (uri) => {
        if (nodeURL.parse(uri).protocol !== "https:") {
            const text = await fs.promises.readFile(uri);
            return TextDocument.create(uri, "css", 0, text.toString());
        } else {
        }
    });

    let modelCaches: LanguageModelCache<any>[] = [];
    let linksCaches: ImportDocCache[] = [];
    modelCaches.push(documentRegions);
    linksCaches.push(documentLinks);

    let modes = Object.create(null);
    modes["html"] = getHTMLMode(
        htmlLanguageService,
        cssLanguageService,
        documentRegions,
        documentLinks
    );
    modes["css"] = getCSSMode(cssLanguageService, documentRegions);

    return {
        getModeAtPosition(
            document: TextDocument,
            position: Position
        ): LanguageMode | undefined {
            let languageId = documentRegions
                .get(document)
                .getLanguageAtPosition(position);
            if (languageId) {
                return modes[languageId];
            }
            return undefined;
        },
        getModesInRange(
            document: TextDocument,
            range: Range
        ): LanguageModeRange[] {
            return documentRegions
                .get(document)
                .getLanguageRanges(range)
                .map((r) => {
                    return <LanguageModeRange>{
                        start: r.start,
                        end: r.end,
                        mode: r.languageId && modes[r.languageId],
                        attributeValue: r.attributeValue,
                    };
                });
        },
        getAllModesInDocument(document: TextDocument): LanguageMode[] {
            let result = [];
            for (let languageId of documentRegions
                .get(document)
                .getLanguagesInDocument()) {
                let mode = modes[languageId];
                if (mode) {
                    result.push(mode);
                }
            }
            return result;
        },
        getAllModes(): LanguageMode[] {
            let result = [];
            for (let languageId in modes) {
                let mode = modes[languageId];
                if (mode) {
                    result.push(mode);
                }
            }
            return result;
        },
        getMode(languageId: string): LanguageMode {
            return modes[languageId];
        },
        onDocumentRemoved(document: TextDocument) {
            modelCaches.forEach((mc) => mc.onDocumentRemoved(document));
            for (let mode in modes) {
                modes[mode].onDocumentRemoved(document);
            }
        },
        onChangeCSSDoc(doc: TextDocument) {
            linksCaches.forEach((lc) => lc.onChangeCSSDoc(doc));
        },
        dispose(): void {
            modelCaches.forEach((mc) => mc.dispose());
            linksCaches.forEach((lc) => lc.dispose());
            modelCaches = [];
            linksCaches = [];
            for (let mode in modes) {
                modes[mode].dispose();
            }
            modes = {};
        },
    };
}
