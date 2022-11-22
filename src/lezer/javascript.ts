import * as LEZER_JS from "@lezer/javascript";

export namespace JS_NODE_TYPE {
  export const String = LEZER_JS.parser.nodeSet.types[13],
    Import = LEZER_JS.parser.nodeSet.types[132],
    ImportDeclaration = LEZER_JS.parser.nodeSet.types[218];
}
