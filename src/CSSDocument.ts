import * as Parser from "tree-sitter";

export class CSSDocument {
    private parser = new Parser();
}

export class LocalCSSDocument extends CSSDocument {

}

export class RemoteCSSDocument extends CSSDocument {

}
