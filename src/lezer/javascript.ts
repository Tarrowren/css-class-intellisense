import * as LEZER_JS from "@lezer/javascript";
const types = LEZER_JS.parser.nodeSet.types;

export namespace JS_NODE_TYPE {
  export const String = types[11],
    Import = types[139],
    ImportDeclaration = types[225];
}
