import * as LEZER_HTML from "@lezer/html";

const types = LEZER_HTML.parser.nodeSet.types;

export namespace HTML_NODE_TYPE {
  export const Element = types[18],
    TagName = types[20],
    Attribute = types[21],
    AttributeName = types[22],
    Is = types[23],
    AttributeValue = types[24],
    UnquotedAttributeValue = types[25],
    ScriptText = types[27],
    StyleText = types[30],
    SelfClosingTag = types[37];
}
