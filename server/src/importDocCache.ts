import * as nodeURL from "url";
import { TextDocument } from "vscode-css-languageservice";

export interface ImportDocCache {
    get(uri: string): Promise<TextDocument | undefined>;
    onChangeCSSDoc(doc: TextDocument): void;
    dispose(): void;
}

export function getImportDocCache(
    maxEntries: number,
    cleanupIntervalTimeInSec: number,
    openDoc: (uri: string) => Promise<TextDocument | undefined>
): ImportDocCache {
    let importDocs: {
        [uri: string]: {
            cTime: number;
            importDoc?: TextDocument;
        };
    } = {};
    let nDocs = 0;

    let cleanupInterval: NodeJS.Timer | undefined = undefined;
    if (cleanupIntervalTimeInSec > 0) {
        cleanupInterval = setInterval(() => {
            const cutoffTime = Date.now() - cleanupIntervalTimeInSec * 1000;
            const uris = Object.keys(importDocs);
            for (const uri of uris) {
                const importDocInfo = importDocs[uri];
                if (importDocInfo.cTime < cutoffTime) {
                    delete importDocs[uri];
                    nDocs--;
                }
            }
        }, cleanupIntervalTimeInSec * 1000);
    }

    return {
        async get(uri: string): Promise<TextDocument | undefined> {
            if (!nodeURL.parse(uri).protocol) {
                uri = nodeURL.fileURLToPath(nodeURL.pathToFileURL(uri).href);
            }
            const importDocInfo = importDocs[uri];
            if (importDocInfo) {
                importDocInfo.cTime = Date.now();
                return importDocInfo.importDoc;
            }

            importDocs[uri] = {
                cTime: Date.now(),
            };

            const importDoc = await openDoc(uri);

            importDocs[uri] = {
                cTime: Date.now(),
                importDoc,
            };
            nDocs++;

            if (nDocs === maxEntries) {
                let oldestTime = Number.MAX_VALUE;
                let oldestUri = null;
                for (const uri in importDocs) {
                    const importDocInfo = importDocs[uri];
                    if (importDocInfo.cTime < oldestTime) {
                        oldestUri = uri;
                        oldestTime = importDocInfo.cTime;
                    }
                }
                if (oldestUri) {
                    delete importDocs[oldestUri];
                    nDocs--;
                }
            }
            return importDoc;
        },
        onChangeCSSDoc(doc: TextDocument) {
            const uri = nodeURL.fileURLToPath(doc.uri);
            if (importDocs[uri]) {
                importDocs[uri].importDoc = doc;
            }
        },
        dispose() {
            if (typeof cleanupInterval !== "undefined") {
                clearInterval(cleanupInterval);
                cleanupInterval = undefined;
                importDocs = {};
                nDocs = 0;
            }
        },
    };
}
