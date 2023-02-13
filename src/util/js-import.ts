import { SyntaxNodeRef } from "@lezer/common";
import { TextDocument, Uri } from "vscode";
import { convertToHttpSchemeEx, HTTPS_SCHEME, HTTP_SCHEME } from "../http-file-system";
import { JS_NODE_TYPE } from "../lezer/javascript";
import { getText } from "./text-document";

export function getHrefFromImports(document: TextDocument, ref: SyntaxNodeRef, hrefs: Set<string>) {
  const importNode = ref.node.firstChild;
  if (!importNode || importNode.type !== JS_NODE_TYPE.Import) {
    return;
  }

  const stringNode = importNode.nextSibling;
  if (!stringNode || stringNode.type !== JS_NODE_TYPE.String) {
    return;
  }

  const href = getText(document, stringNode).slice(1, -1);
  if (href && !href.endsWith(".module.css")) {
    const uri = Uri.parse(href);
    if (uri.scheme === HTTP_SCHEME || uri.scheme === HTTPS_SCHEME) {
      hrefs.add(convertToHttpSchemeEx(uri).toString(true));
    } else if (uri.scheme === "file") {
      hrefs.add(Uri.joinPath(document.uri, "..", uri.path).toString(true));
    }
  }
}
