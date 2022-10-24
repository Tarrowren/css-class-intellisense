import { Disposable } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { noop } from "../runner";

export type Document = MainDocument | ReferenceDocument;

export interface MainDocument {
  readonly isReferenced: false;
  readonly textDocument: TextDocument;
  references: Set<string>;
  update(textDocument: TextDocument): MainDocument;
}

export namespace MainDocument {
  export function create(textDocument: TextDocument, references = new Set<string>()): MainDocument {
    let _references = references;
    return {
      get isReferenced(): false {
        return false;
      },
      get textDocument() {
        return textDocument;
      },
      get references() {
        return _references;
      },
      set references(references: Set<string>) {
        _references = references;
      },
      update(textDocument) {
        return create(textDocument, _references);
      },
    };
  }
}

interface BaseReferenceDocument {
  readonly isReferenced: true;
  addReference(): void;
  deleteReference(): void;
}

export interface OpenedReferenceDocument extends BaseReferenceDocument {
  readonly isOpened: true;
  readonly textDocument: TextDocument;
  update(textDocument: TextDocument): OpenedReferenceDocument;
  close(): UnopenedReferenceDocument | undefined;
}

export interface UnopenedReferenceDocument extends BaseReferenceDocument {
  readonly isOpened: false;
  readonly isLocal: boolean;
  readonly textDocument: Promise<TextDocument | undefined>;
  open(textDocument: TextDocument): OpenedReferenceDocument;
  dispose(): void;
}

export type ReferenceDocument = OpenedReferenceDocument | UnopenedReferenceDocument;

export interface RequestDocumentResult extends Disposable {
  isLocal: boolean;
  content: Promise<TextDocument | undefined>;
}

export namespace OpenedReferenceDocument {
  export function create(
    uri: string,
    textDocument: TextDocument,
    remove: (key: string) => void,
    referenceCount = 0
  ): OpenedReferenceDocument {
    let count = referenceCount;

    return {
      get isReferenced(): true {
        return true;
      },
      addReference() {
        count++;
      },
      deleteReference() {
        count--;
      },
      get isOpened(): true {
        return true;
      },
      get textDocument() {
        return textDocument;
      },
      update(textDocument) {
        return create(uri, textDocument, remove, count);
      },
      close() {
        if (count <= 0) {
          remove(uri);
        } else {
          return UnopenedReferenceDocument.create(
            uri,
            { isLocal: true, content: Promise.resolve(textDocument), dispose: noop },
            remove,
            count
          );
        }
      },
    };
  }
}

export namespace UnopenedReferenceDocument {
  export function create(
    uri: string,
    result: RequestDocumentResult,
    remove: (key: string) => void,
    referenceCount = 0
  ): UnopenedReferenceDocument {
    let _isLocal = result.isLocal;
    let _content = result.content;

    if (!_isLocal) {
      _content.then(() => {
        _isLocal = true;
      });
    }

    let count = referenceCount;

    return {
      get isReferenced(): true {
        return true;
      },
      addReference() {
        count++;
      },
      deleteReference() {
        count--;
        if (count <= 0) {
          result.dispose();
          remove(uri);
        }
      },
      get isOpened(): false {
        return false;
      },
      get textDocument() {
        return _content;
      },
      get isLocal() {
        return _isLocal;
      },
      open(textDocument) {
        result.dispose();
        return OpenedReferenceDocument.create(uri, textDocument, remove, count);
      },
      dispose() {
        result.dispose();
      },
    };
  }
}
