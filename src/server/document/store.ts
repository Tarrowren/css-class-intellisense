import { Emitter, Event } from "vscode-languageserver";
import { TextDocument, TextDocumentContentChangeEvent } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";
import { formatError, RequestService } from "../runner";
import { Document, MainDocument, RefDocument } from "./document";

export function getDocumentStore(request: RequestService): DocumentStore {
  const emitter = new Emitter<string>();
  const cache = new Map<string, Document>();

  function getMainDoc(uri: string): MainDocument | undefined {
    const doc = cache.get(uri);
    if (doc && !doc.isReferenced) {
      return doc;
    }
  }

  function getRefDoc(uri: string): RefDocument | undefined {
    const doc = cache.get(uri);
    if (doc && doc.isReferenced) {
      return doc;
    }
  }

  function onDelete(uri: string) {
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

      const outdated = getRefDoc(uri);

      if (!outdated) {
        cache.set(uri, RefDocument.createOpened(uri, doc, onDelete));
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

      const doc = TextDocument.update(outdated.doc, changes, version);

      cache.set(uri, outdated.update(doc));

      return true;
    },
    delete(uri) {
      const doc = cache.get(uri);

      if (!doc || (doc.isReferenced && !doc.isOpened)) {
        return false;
      }

      if (doc.isReferenced) {
        const refDoc = doc.close();
        if (refDoc) {
          cache.set(uri, refDoc);
        }
      } else {
        for (const ref of doc.references) {
          getRefDoc(ref)?.delRefCount();
        }
        cache.delete(uri);
      }

      return true;
    },
    getMainTextDocument(uri) {
      return getMainDoc(uri)?.doc;
    },
    changeRef(uri, refs) {
      const mainDoc = getMainDoc(uri);
      if (!mainDoc) {
        throw new Error(`Not found ${uri}`);
      }

      const oldRefs = mainDoc.references;
      mainDoc.references = refs;

      for (const uri of oldRefs) {
        if (!refs.has(uri)) {
          getRefDoc(uri)?.delRefCount();
        }
      }

      const result: RefDocument[] = [];
      for (const uri of refs) {
        let refDoc = getRefDoc(uri);

        if (oldRefs.has(uri)) {
          if (!refDoc) {
            throw new Error("Missing document cache");
          }

          result.push(refDoc);
        } else {
          if (!refDoc) {
            const result = request.getContent(URI.parse(uri));
            refDoc = RefDocument.createUnopened(
              uri,
              {
                isLocal: result.isLocal,
                content: result.content
                  .then((text) => {
                    return TextDocument.create(uri, "css", 0, text);
                  })
                  .catch((e) => {
                    console.error(formatError("Open file failed", e));
                    throw e;
                  }),
                dispose() {
                  result.dispose();
                },
              },
              onDelete
            );
            cache.set(uri, refDoc);
          }

          refDoc.addRefCount();
          result.push(refDoc);
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
  changeRef(uri: string, refs: Set<string>): RefDocument[];
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
