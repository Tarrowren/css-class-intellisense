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
        },
        doComplete(document: TextDocument, position: Position) {
            return [];
        },
        onDocumentRemoved(_document: TextDocument) {},
        dispose() {},
    };
}
