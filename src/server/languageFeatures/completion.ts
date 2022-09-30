import { CompletionItem, Position } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

export function doComplete(document: TextDocument, position: Position) {
  const items: CompletionItem[] = [];

  return items;
}

// connection.onCompletion(({ textDocument, position }, token) => {
//   return runSafeAsync(
//     async () => {
//       const cache = documents.get(textDocument.uri);
//       if (!cache) {
//         return null;
//       }

//       const { doc, tree } = cache;

//       const cursor = tree.cursorAt(doc.offsetAt(position));

//       if (
//         cursor.type !== getHtmlNodeType(HtmlNodeTypeId.AttributeValue) ||
//         !cursor.parent() ||
//         cursor.type !== getHtmlNodeType(HtmlNodeTypeId.Attribute) ||
//         !cursor.firstChild() ||
//         cursor.type !== getHtmlNodeType(HtmlNodeTypeId.AttributeName) ||
//         cache.getText(cursor) !== "class"
//       ) {
//         return null;
//       }

//       const items: CompletionItem[] = [];

//       const links: string[] = [];

//       const inline = new Set<string>();
//       tree.cursor().iterate((ref) => {
//         switch (ref.type) {
//           case getHtmlNodeType(HtmlNodeTypeId.Element): {
//             const node = ref.node;
//             const tag = node.firstChild;
//             if (!tag) {
//               return;
//             }

//             const tagName = tag.getChild(HtmlNodeTypeId.TagName);
//             if (!tagName || cache.getText(tagName) !== "link") {
//               return;
//             }

//             const attr = tag
//               .getChildren(HtmlNodeTypeId.Attribute)
//               .find(({ firstChild }) => {
//                 if (
//                   firstChild &&
//                   firstChild.type ===
//                     getHtmlNodeType(HtmlNodeTypeId.AttributeName) &&
//                   cache.getText(firstChild) === "href"
//                 ) {
//                   return true;
//                 } else {
//                   return false;
//                 }
//               });

//             if (
//               !attr ||
//               !attr.lastChild ||
//               attr.lastChild.type !==
//                 getHtmlNodeType(HtmlNodeTypeId.AttributeValue)
//             ) {
//               return;
//             }

//             const path = cache.getText(attr.lastChild).slice(1, -1);

//             if (path) {
//               links.push(path);
//             }

//             return false;
//           }
//           case getCssNodeType(CssNodeTypeId.ClassName):
//             const label = cache.getText(ref);
//             if (!inline.has(label)) {
//               inline.add(label);
//               items.push({
//                 label,
//                 labelDetails: {
//                   detail: "(inline)",
//                 },
//                 kind: CompletionItemKind.Class,
//               });
//             }

//             break;
//         }
//       });

//       if (links.length > 0) {
//         const local = new Set<string>();
//         const remote = new Set<string>();
//         await Promise.all(
//           links.map(async (path) => {
//             const uri = URI.parse(path);

//             switch (uri.scheme) {
//               case "https":
//               case "http": {
//                 try {
//                   const key = uri.toString();
//                   let cache = documents.get(key);

//                   if (!cache) {
//                     const resp = await xhr({ url: key });
//                     const css = TextDocument.create(
//                       key,
//                       "css",
//                       0,
//                       resp.responseText
//                     );
//                     cache = createCache(css);
//                     documents.set(key, cache);
//                   }

//                   cache.tree.cursor().iterate((ref) => {
//                     switch (ref.type) {
//                       case getCssNodeType(CssNodeTypeId.ClassName):
//                         const label = cache!.getText(ref);
//                         if (!remote.has(label)) {
//                           remote.add(label);
//                           items.push({
//                             label,
//                             labelDetails: {
//                               detail: "(remote)",
//                             },
//                             kind: CompletionItemKind.Class,
//                           });
//                         }
//                         break;
//                     }
//                   });
//                 } catch (e: any) {
//                   if (e.status) {
//                     console.error(getErrorStatusDescription(e.status));
//                   } else {
//                     console.error(e.toString());
//                   }
//                 }

//                 break;
//               }
//               case "file": {
//                 const uri = Utils.joinPath(URI.parse(doc.uri), "..", path);
//                 const key = uri.toString();
//                 let cache = documents.get(key);
//                 if (!cache) {
//                   const css = TextDocument.create(
//                     key,
//                     "css",
//                     0,
//                     await readFile(uri.fsPath, "utf8")
//                   );
//                   cache = createCache(css);
//                   documents.set(key, cache);
//                 }

//                 cache.tree.cursor().iterate((ref) => {
//                   switch (ref.type) {
//                     case getCssNodeType(CssNodeTypeId.ClassName):
//                       const label = cache!.getText(ref);
//                       if (!local.has(label)) {
//                         local.add(label);
//                         items.push({
//                           label,
//                           labelDetails: {
//                             detail: "(local)",
//                           },
//                           kind: CompletionItemKind.Class,
//                         });
//                       }
//                       break;
//                   }
//                 });
//                 break;
//               }
//             }
//           })
//         );
//       }

//       return items;
//     },
//     null,
//     `Error while computing completions for ${textDocument.uri}`,
//     token
//   );
// });
