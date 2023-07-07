import * as LEZER_SASS from "@lezer/sass";

const types = LEZER_SASS.parser.nodeSet.types;

export const SASS_NODE_TYPE = {
  // StyleSheet: types[10],
  // RuleSet: types[11],
  // NestingSelector: types[15],
  // SuffixedSelector: types[16],
  Suffix: types[17],
  ",": types[38],
  // ClassSelector: types[42],
  ClassName: types[43],
  // PseudoClassSelector: types[44],
  // IdSelector: types[51],
  // "#": types[52],
  IdName: types[53],
  // AttributeSelector: types[55],
  // ChildSelector: types[59],
  // ChildOp: types[60],
  // DescendantSelector: types[61],
  // SiblingSelector: types[62],
  Block: types[64],
};
