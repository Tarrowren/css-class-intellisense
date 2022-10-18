import { Disposable } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

export type Document = MainDocument | RefDocument;

export interface MainDocument {
  readonly isReferenced: false;
  readonly doc: TextDocument;
  references: Set<string>;
  update(doc: TextDocument): MainDocument;
}

export namespace MainDocument {
  export function create(doc: TextDocument, references = new Set<string>()): MainDocument {
    let _references = references;
    return {
      get isReferenced(): false {
        return false;
      },
      get doc() {
        return doc;
      },
      get references() {
        return _references;
      },
      set references(references: Set<string>) {
        _references = references;
      },
      update(doc) {
        return create(doc, _references);
      },
    };
  }
}

interface BaseRefDocument {
  readonly isReferenced: true;
  addRefCount(): void;
  delRefCount(): void;
  readonly referenceCount: number;
}

export interface OpenedRefDocument extends BaseRefDocument {
  readonly isOpened: true;
  readonly doc: TextDocument;
  update(doc: TextDocument): OpenedRefDocument;
  close(): UnopenedRefDocument | undefined;
}

export interface UnopenedRefDocument extends BaseRefDocument {
  readonly isOpened: false;
  readonly isLocal: boolean;
  readonly doc: Promise<TextDocument>;
  open(doc: TextDocument): OpenedRefDocument;
  dispose(): void;
}

export type RefDocument = OpenedRefDocument | UnopenedRefDocument;

export interface RequestDocumentResult extends Disposable {
  isLocal: boolean;
  content: Promise<TextDocument>;
}

export namespace RefDocument {
  export function createOpened(
    uri: string,
    doc: TextDocument,
    onDelete: (key: string) => void,
    referenceCount = 0
  ): OpenedRefDocument {
    let count = referenceCount;

    return {
      get isReferenced(): true {
        return true;
      },
      addRefCount() {
        count++;
      },
      delRefCount() {
        count--;
      },
      get referenceCount() {
        return count;
      },
      get isOpened(): true {
        return true;
      },
      get doc() {
        return doc;
      },
      update(doc) {
        return createOpened(uri, doc, onDelete, count);
      },
      close() {
        if (count <= 0) {
          onDelete(uri);
        } else {
          return createUnopened(uri, { isLocal: true, content: Promise.resolve(doc), dispose() {} }, onDelete, count);
        }
      },
    };
  }

  export function createUnopened(
    uri: string,
    result: RequestDocumentResult,
    onDelete: (key: string) => void,
    referenceCount = 0
  ): UnopenedRefDocument {
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
      addRefCount() {
        count++;
      },
      delRefCount() {
        count--;
        if (count <= 0) {
          result.dispose();
          onDelete(uri);
        }
      },
      get referenceCount() {
        return count;
      },
      get isOpened(): false {
        return false;
      },
      get doc() {
        return _content;
      },
      get isLocal() {
        return _isLocal;
      },
      open(doc) {
        result.dispose();
        return createOpened(uri, doc, onDelete, count);
      },
      dispose() {
        result.dispose();
      },
    };
  }
}
