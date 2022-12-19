import * as LEZER_JS from "@lezer/javascript";

const types = LEZER_JS.parser.nodeSet.types;

export namespace JS_NODE_TYPE {
  export const String = types[12],
    Import = types[135],
    ImportDeclaration = types[221];
}
