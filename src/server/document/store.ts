import { Emitter, Event } from "vscode-languageserver";
import { TextDocument, TextDocumentContentChangeEvent } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";
import { formatError, RequestService } from "../runner";
import {
  Document,
  MainDocument,
  OpenedReferenceDocument,
  ReferenceDocument,
  UnopenedReferenceDocument,
} from "./document";

export function getDocumentStore(request: RequestService): DocumentStore {
  const cache = new Map<string, Document>();
  const emitter = new Emitter<string>();

  function getMainDocument(uri: string): MainDocument | undefined {
    const doc = cache.get(uri);
    if (doc && !doc.isReferenced) {
      return doc;
    }
  }

  function getReferenceDocument(uri: string): ReferenceDocument | undefined {
    const doc = cache.get(uri);
    if (doc && doc.isReferenced) {
      return doc;
    }
  }

  function deleteDocument(uri: string) {
    cache.delete(uri);
    emitter.fire(uri);
  }

  return {
    open(uri, languageId, version, content) {
      const doc = TextDocument.create(uri, languageId, version, content);

      if (!languageIdIsReferenced[languageId]) {
        cache.set(uri, MainDocument.create(doc));
        return;
      }

      const outdated = getReferenceDocument(uri);

      if (!outdated) {
        cache.set(uri, OpenedReferenceDocument.create(uri, doc, deleteDocument));
        return;
      }

      if (!outdated.isOpened) {
        cache.set(uri, outdated.open(doc));
        return;
      }
    },
    update(uri, changes, version) {
      const outdated = cache.get(uri);
      if (!outdated || (outdated.isReferenced && !outdated.isOpened)) {
        return false;
      }

      const doc = TextDocument.update(outdated.textDocument, changes, version);

      cache.set(uri, outdated.update(doc));

      return true;
    },
    delete(uri) {
      const doc = cache.get(uri);

      if (!doc || (doc.isReferenced && !doc.isOpened)) {
        return false;
      }

      if (doc.isReferenced) {
        const unopenedReferenceDocument = doc.close();
        if (unopenedReferenceDocument) {
          cache.set(uri, unopenedReferenceDocument);
        }
      } else {
        for (const ref of doc.references) {
          getReferenceDocument(ref)?.deleteReference();
        }
        cache.delete(uri);
      }

      return true;
    },
    getMainTextDocument(uri) {
      return getMainDocument(uri)?.textDocument;
    },
    changeReferenceDocument(uri, refs) {
      const mainDoc = getMainDocument(uri);
      if (!mainDoc) {
        return [];
      }

      const oldRefs = mainDoc.references;
      mainDoc.references = refs;

      for (const uri of oldRefs) {
        if (!refs.has(uri)) {
          getReferenceDocument(uri)?.deleteReference();
        }
      }

      const result: ReferenceDocument[] = [];
      for (const uri of refs) {
        let referenceDocument = getReferenceDocument(uri);

        if (oldRefs.has(uri)) {
          if (!referenceDocument) {
            console.error(`Missing cache, uri: ${uri}`);
          } else {
            result.push(referenceDocument);
          }
        } else {
          if (!referenceDocument) {
            const result = request.getContent(URI.parse(uri));
            referenceDocument = UnopenedReferenceDocument.create(
              uri,
              {
                isLocal: result.isLocal,
                content: result.content
                  .then((text) => {
                    return TextDocument.create(uri, "css", 0, text);
                  })
                  .catch((e) => {
                    console.error(formatError("Load file failed", e));
                    return null;
                  }),
                dispose() {
                  result.dispose();
                },
              },
              deleteDocument
            );
            cache.set(uri, referenceDocument);
          }

          referenceDocument.addReference();
          result.push(referenceDocument);
        }
      }

      return result;
    },
    addEventListener: emitter.event,
    dispose() {
      emitter.dispose();
      for (const doc of cache.values()) {
        if (doc.isReferenced && !doc.isOpened) {
          doc.dispose();
        }
      }
      cache.clear();
    },
  };
}

export interface DocumentStore {
  open(uri: string, languageId: string, version: number, content: string): void;
  update(uri: string, changes: TextDocumentContentChangeEvent[], version: number): boolean;
  delete(uri: string): boolean;
  getMainTextDocument(uri: string): TextDocument | undefined;
  changeReferenceDocument(uri: string, refs: Set<string>): ReferenceDocument[];
  addEventListener: Event<string>;
  dispose(): void;
}

const languageIdIsReferenced: { [languageId: string]: boolean } = {
  css: true,
  scss: true,
  less: true,
  html: false,
  vue: false,
  javascript: false,
  javascriptreact: false,
  typescript: false,
  typescriptreact: false,
};
