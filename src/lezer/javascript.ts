import * as LEZER_JS from "@lezer/javascript";

const types = LEZER_JS.parser.nodeSet.types;

export const JS_NODE_TYPE = {
  String: types[11],
  Equals: types[101],
  Import: types[140],
  JSXIdentifier: types[148],
  JSXAttribute: types[152],
  JSXAttributeValue: types[153],
  ImportDeclaration: types[226],
};
