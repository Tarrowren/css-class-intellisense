import * as css from "@lezer/css";
import * as html from "@lezer/html";

export enum CssNodeTypeId {
  StyleSheet = 4,
  ClassName = 11,
}

export enum HtmlNodeTypeId {
  Element = 18,
  TagName = 20,
  Attribute = 21,
  AttributeName = 22,
  Is = 23,
  AttributeValue = 24,
  ScriptText = 27,
  StyleText = 30,
}

export function getCssNodeType(id: CssNodeTypeId) {
  return css.parser.nodeSet.types[id];
}

export function getHtmlNodeType(id: HtmlNodeTypeId) {
  return html.parser.nodeSet.types[id];
}
