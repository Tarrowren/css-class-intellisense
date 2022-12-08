import * as LEZER_CSS from "@lezer/css";

const types = LEZER_CSS.parser.nodeSet.types;

export namespace CSS_NODE_TYPE {
  export const StyleSheet = types[4],
    RuleSet = types[5],
    ClassSelector = types[10],
    ClassName = types[11],
    IdSelector = types[35],
    IdName = types[37],
    Block = types[50];
}
