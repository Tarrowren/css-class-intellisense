import assert from "node:assert";
import test from "node:test";
import { CSS_NODE_TYPE } from "../../lezer/css";
import { HTML_NODE_TYPE } from "../../lezer/html";
import { JS_NODE_TYPE } from "../../lezer/javascript";
import { PHP_NODE_TYPE } from "../../lezer/php";

test("Lezer", async (t) => {
  await t.test("Lezer CSS test", () => {
    assert.strictEqual(CSS_NODE_TYPE.StyleSheet.name, "StyleSheet");
    assert.strictEqual(CSS_NODE_TYPE.RuleSet.name, "RuleSet");
    assert.strictEqual(CSS_NODE_TYPE.ClassSelector.name, "ClassSelector");
    assert.strictEqual(CSS_NODE_TYPE.ClassName.name, "ClassName");
    assert.strictEqual(CSS_NODE_TYPE.PseudoClassSelector.name, "PseudoClassSelector");
    assert.strictEqual(CSS_NODE_TYPE.IdSelector.name, "IdSelector");
    assert.strictEqual(CSS_NODE_TYPE["#"].name, "#");
    assert.strictEqual(CSS_NODE_TYPE.IdName.name, "IdName");
    assert.strictEqual(CSS_NODE_TYPE.AttributeSelector.name, "AttributeSelector");
    assert.strictEqual(CSS_NODE_TYPE.ChildSelector.name, "ChildSelector");
    assert.strictEqual(CSS_NODE_TYPE.ChildOp.name, "ChildOp");
    assert.strictEqual(CSS_NODE_TYPE.DescendantSelector.name, "DescendantSelector");
    assert.strictEqual(CSS_NODE_TYPE.SiblingSelector.name, "SiblingSelector");
    assert.strictEqual(CSS_NODE_TYPE.Block.name, "Block");
    assert.strictEqual(CSS_NODE_TYPE.MediaStatement.name, "MediaStatement");
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

  await t.test("Lezer PHP test", () => {
    assert.strictEqual(PHP_NODE_TYPE.Text.name, "Text");
  });
});
