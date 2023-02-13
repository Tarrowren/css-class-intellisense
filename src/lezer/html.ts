import * as LEZER_HTML from "@lezer/html";

const types = LEZER_HTML.parser.nodeSet.types;

export namespace HTML_NODE_TYPE {
  export const Element = types[20],
    TagName = types[22],
    Attribute = types[23],
    AttributeName = types[24],
    Is = types[25],
    AttributeValue = types[26],
    UnquotedAttributeValue = types[27],
    ScriptText = types[28],
    StyleText = types[31],
    SelfClosingTag = types[38];
}
