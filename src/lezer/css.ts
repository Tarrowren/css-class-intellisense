import * as LEZER_CSS from "@lezer/css";

export namespace CSS_NODE_TYPE {
  export const StyleSheet = LEZER_CSS.parser.nodeSet.types[4],
    ClassName = LEZER_CSS.parser.nodeSet.types[11];
}
