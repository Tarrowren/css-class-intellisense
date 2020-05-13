import {
    LanguageService as CSSLanguageService,
    Position,
    TextDocument,
} from "vscode-css-languageservice";
import { HTMLDocumentRegions } from "../embeddedSupport";
import { LanguageModelCache } from "../languageModelCache";
import { LanguageMode } from "../languageModes";

export function getCSSMode(
    cssLanguageService: CSSLanguageService,
    documentRegions: LanguageModelCache<HTMLDocumentRegions>
): LanguageMode {
    return {
        getId() {
            return "css";
        },
        doValidation(document: TextDocument) {
            return [];
            // // Get virtual CSS document, with all non-CSS code replaced with whitespace
            // const embedded = documentRegions
            //     .get(document)
            //     .getEmbeddedDocument("css");
            // const stylesheet = cssLanguageService.parseStylesheet(embedded);
            // return cssLanguageService.doValidation(embedded, stylesheet);
        },
        doComplete(document: TextDocument, position: Position) {
            return [];
            // // Get virtual CSS document, with all non-CSS code replaced with whitespace
            // const embedded = documentRegions
            //     .get(document)
            //     .getEmbeddedDocument("css");
            // const stylesheet = cssLanguageService.parseStylesheet(embedded);
            // cssLanguageService.findDocumentSymbols(embedded, stylesheet);
            // return cssLanguageService.doComplete(
            //     embedded,
            //     position,
            //     stylesheet
            // );
        },
        onDocumentRemoved(_document: TextDocument) {},
        dispose() {},
    };
}
