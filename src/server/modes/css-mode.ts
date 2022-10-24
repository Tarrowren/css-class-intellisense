import { Location } from "vscode-languageserver";
import { LanguageCaches } from "../caches/language-caches";
import { DocumentStore } from "../document/store";
import { CssNodeType, cssNodeTypes } from "../nodetype";
import { getText } from "../utils/string";
import { LanguageMode } from "./language-modes";

export function getCSSMode(store: DocumentStore, caches: LanguageCaches): LanguageMode {
  const id = "css";
  const cssCache = caches.getCache(id);

  if (!cssCache) {
    throw new Error("Missing cache");
  }

  return {
    getId() {
      return id;
    },
    async findReferences(document, position) {
      const entry = cssCache.get(document);

      const cursor = entry.tree.cursorAt(document.offsetAt(position));

      if (cursor.type !== cssNodeTypes[CssNodeType.ClassName]) {
        return null;
      }

      const className = getText(document, cursor);

      const references: Location[] = [];

      store.findAllMainTextDocument().forEach((doc) => {
        const cache = caches.getCache(doc.languageId);
        if (!cache) {
          return;
        }

        cache
          .get(doc)
          .classAttributeData?.get(className)
          ?.forEach((range) => {
            references.push(Location.create(doc.uri, range));
          });
      });

      return references;
    },
    onDocumentRemoved(_document) {},
    dispose() {},
  };
}
