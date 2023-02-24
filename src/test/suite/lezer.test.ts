import assert from "node:assert";
import test from "node:test";
import { CSS_NODE_TYPE } from "../../lezer/css";
import { HTML_NODE_TYPE } from "../../lezer/html";
import { JS_NODE_TYPE } from "../../lezer/javascript";

test("Lezer", async (t) => {
  await t.test("Lezer CSS test", () => {
    assert.strictEqual(CSS_NODE_TYPE.StyleSheet.name, "StyleSheet");
    assert.strictEqual(CSS_NODE_TYPE.RuleSet.name, "RuleSet");
    assert.strictEqual(CSS_NODE_TYPE.ClassSelector.name, "ClassSelector");
    assert.strictEqual(CSS_NODE_TYPE.ClassName.name, "ClassName");
    assert.strictEqual(CSS_NODE_TYPE.IdSelector.name, "IdSelector");
    assert.strictEqual(CSS_NODE_TYPE["#"].name, "#");
    assert.strictEqual(CSS_NODE_TYPE.IdName.name, "IdName");
    assert.strictEqual(CSS_NODE_TYPE.Block.name, "Block");
  });

  await t.test("Lezer HTML test", () => {
    assert.strictEqual(HTML_NODE_TYPE.Element.name, "Element");
    assert.strictEqual(HTML_NODE_TYPE.TagName.name, "TagName");
    assert.strictEqual(HTML_NODE_TYPE.Attribute.name, "Attribute");
    assert.strictEqual(HTML_NODE_TYPE.AttributeName.name, "AttributeName");
    assert.strictEqual(HTML_NODE_TYPE.Is.name, "Is");
    assert.strictEqual(HTML_NODE_TYPE.AttributeValue.name, "AttributeValue");
    assert.strictEqual(HTML_NODE_TYPE.UnquotedAttributeValue.name, "UnquotedAttributeValue");
    assert.strictEqual(HTML_NODE_TYPE.ScriptText.name, "ScriptText");
    assert.strictEqual(HTML_NODE_TYPE.StyleText.name, "StyleText");
    assert.strictEqual(HTML_NODE_TYPE.SelfClosingTag.name, "SelfClosingTag");
  });

  await t.test("Lezer JavaScript test", () => {
    assert.strictEqual(JS_NODE_TYPE.String.name, "String");
    assert.strictEqual(JS_NODE_TYPE.Equals.name, "Equals");
    assert.strictEqual(JS_NODE_TYPE.Import.name, "import");
    assert.strictEqual(JS_NODE_TYPE.JSXIdentifier.name, "JSXIdentifier");
    assert.strictEqual(JS_NODE_TYPE.JSXAttribute.name, "JSXAttribute");
    assert.strictEqual(JS_NODE_TYPE.JSXAttributeValue.name, "JSXAttributeValue");
    assert.strictEqual(JS_NODE_TYPE.ImportDeclaration.name, "ImportDeclaration");
  });
});
