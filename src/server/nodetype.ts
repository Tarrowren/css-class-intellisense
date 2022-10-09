import * as LEZER_CSS from "@lezer/css";
import * as LEZER_HTML from "@lezer/html";

export enum CssNodeType {
  StyleSheet = 4,
  ClassName = 11,
}

export enum HtmlNodeType {
  Element = 18,
  TagName = 20,
  Attribute = 21,
  AttributeName = 22,
  Is = 23,
  AttributeValue = 24,
  ScriptText = 27,
  StyleText = 30,
  SelfClosingTag = 37,
}

export const LEZER_CSS_NODE_TYPES = LEZER_CSS.parser.nodeSet.types;
export const LEZER_HTML_NODE_TYPES = LEZER_HTML.parser.nodeSet.types;
