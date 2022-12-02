import { strictEqual } from "node:assert";
import { CSS_NODE_TYPE } from "../../lezer/css";
import { HTML_NODE_TYPE } from "../../lezer/html";
import { JS_NODE_TYPE } from "../../lezer/javascript";

suite("Lezer", () => {
  test("Lezer CSS test", () => {
    strictEqual(CSS_NODE_TYPE.ClassName.name, "ClassName");
    strictEqual(CSS_NODE_TYPE.StyleSheet.name, "StyleSheet");
  });

  test("Lezer HTML test", () => {
    strictEqual(HTML_NODE_TYPE.Element.name, "Element");
    strictEqual(HTML_NODE_TYPE.TagName.name, "TagName");
    strictEqual(HTML_NODE_TYPE.Attribute.name, "Attribute");
    strictEqual(HTML_NODE_TYPE.AttributeName.name, "AttributeName");
    strictEqual(HTML_NODE_TYPE.Is.name, "Is");
    strictEqual(HTML_NODE_TYPE.AttributeValue.name, "AttributeValue");
    strictEqual(HTML_NODE_TYPE.UnquotedAttributeValue.name, "UnquotedAttributeValue");
    strictEqual(HTML_NODE_TYPE.ScriptText.name, "ScriptText");
    strictEqual(HTML_NODE_TYPE.StyleText.name, "StyleText");
    strictEqual(HTML_NODE_TYPE.SelfClosingTag.name, "SelfClosingTag");
  });

  test("Lezer JavaScript test", () => {
    strictEqual(JS_NODE_TYPE.String.name, "String");
    strictEqual(JS_NODE_TYPE.Import.name, "import");
    strictEqual(JS_NODE_TYPE.ImportDeclaration.name, "ImportDeclaration");
  });
});
