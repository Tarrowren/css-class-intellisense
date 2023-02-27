import * as LEZER_CSS from "@lezer/css";

const types = LEZER_CSS.parser.nodeSet.types;

export const CSS_NODE_TYPE = {
  StyleSheet: types[4],
  RuleSet: types[5],
  ClassSelector: types[10],
  ClassName: types[11],
  PseudoClassSelector: types[12],
  IdSelector: types[35],
  "#": types[36],
  IdName: types[37],
  AttributeSelector: types[39],
  ChildSelector: types[43],
  ChildOp: types[44],
  DescendantSelector: types[45],
  SiblingSelector: types[46],
  Block: types[50],
  MediaStatement: types[68],
};
