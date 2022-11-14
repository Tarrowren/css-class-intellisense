import * as LEZER_HTML from "@lezer/html";

export namespace HTML_NODE_TYPE {
  export const Element = LEZER_HTML.parser.nodeSet.types[18],
    TagName = LEZER_HTML.parser.nodeSet.types[20],
    Attribute = LEZER_HTML.parser.nodeSet.types[21],
    AttributeName = LEZER_HTML.parser.nodeSet.types[22],
    Is = LEZER_HTML.parser.nodeSet.types[23],
    AttributeValue = LEZER_HTML.parser.nodeSet.types[24],
    UnquotedAttributeValue = LEZER_HTML.parser.nodeSet.types[25],
    ScriptText = LEZER_HTML.parser.nodeSet.types[27],
    StyleText = LEZER_HTML.parser.nodeSet.types[30],
    SelfClosingTag = LEZER_HTML.parser.nodeSet.types[37];
}
