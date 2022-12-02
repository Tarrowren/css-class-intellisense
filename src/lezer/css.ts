import * as LEZER_CSS from "@lezer/css";

const types = LEZER_CSS.parser.nodeSet.types;

export namespace CSS_NODE_TYPE {
  export const StyleSheet = types[4],
    ClassName = types[11],
    IdName = types[37];
}
