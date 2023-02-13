import * as LEZER_JS from "@lezer/javascript";
const types = LEZER_JS.parser.nodeSet.types;

export namespace JS_NODE_TYPE {
  export const String = types[11],
    Equals = types[100],
    Import = types[139],
    JSXIdentifier = types[147],
    JSXAttribute = types[151],
    JSXAttributeValue = types[152],
    ImportDeclaration = types[225];
}
