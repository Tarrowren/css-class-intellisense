import * as LEZER_JS from "@lezer/javascript";

const types = LEZER_JS.parser.nodeSet.types;

export const JS_NODE_TYPE = {
  String: types[12],
  Equals: types[102],
  Import: types[141],
  JSXIdentifier: types[149],
  JSXAttribute: types[153],
  JSXAttributeValue: types[154],
  ImportDeclaration: types[227],
};
