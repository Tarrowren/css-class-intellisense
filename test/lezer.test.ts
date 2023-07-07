import { describe, expect, it } from "@jest/globals";
import { CSS_NODE_TYPE } from "@src/lezer/css";
import { HTML_NODE_TYPE } from "@src/lezer/html";
import { JS_NODE_TYPE } from "@src/lezer/javascript";
import { PHP_NODE_TYPE } from "@src/lezer/php";
import { SASS_NODE_TYPE } from "@src/lezer/sass";

describe("Lezer", () => {
  it("Lezer CSS test", () => {
    expect(CSS_NODE_TYPE.StyleSheet.name).toBe("StyleSheet");
    expect(CSS_NODE_TYPE.RuleSet.name).toBe("RuleSet");
    expect(CSS_NODE_TYPE.ClassSelector.name).toBe("ClassSelector");
    expect(CSS_NODE_TYPE.ClassName.name).toBe("ClassName");
    expect(CSS_NODE_TYPE.PseudoClassSelector.name).toBe("PseudoClassSelector");
    expect(CSS_NODE_TYPE.IdSelector.name).toBe("IdSelector");
    expect(CSS_NODE_TYPE["#"].name).toBe("#");
    expect(CSS_NODE_TYPE.IdName.name).toBe("IdName");
    expect(CSS_NODE_TYPE.AttributeSelector.name).toBe("AttributeSelector");
    expect(CSS_NODE_TYPE.ChildSelector.name).toBe("ChildSelector");
    expect(CSS_NODE_TYPE.ChildOp.name).toBe("ChildOp");
    expect(CSS_NODE_TYPE.DescendantSelector.name).toBe("DescendantSelector");
    expect(CSS_NODE_TYPE.SiblingSelector.name).toBe("SiblingSelector");
    expect(CSS_NODE_TYPE.Block.name).toBe("Block");
    expect(CSS_NODE_TYPE.MediaStatement.name).toBe("MediaStatement");
  });

  it("Lezer SASS test", () => {
    expect(SASS_NODE_TYPE.Suffix.name).toBe("Suffix");
    expect(SASS_NODE_TYPE[","].name).toBe(",");
    expect(SASS_NODE_TYPE.ClassName.name).toBe("ClassName");
    expect(SASS_NODE_TYPE.IdName.name).toBe("IdName");
    expect(SASS_NODE_TYPE.Block.name).toBe("Block");
  });

  it("Lezer HTML test", () => {
    expect(HTML_NODE_TYPE.Element.name).toBe("Element");
    expect(HTML_NODE_TYPE.TagName.name).toBe("TagName");
    expect(HTML_NODE_TYPE.Attribute.name).toBe("Attribute");
    expect(HTML_NODE_TYPE.AttributeName.name).toBe("AttributeName");
    expect(HTML_NODE_TYPE.Is.name).toBe("Is");
    expect(HTML_NODE_TYPE.AttributeValue.name).toBe("AttributeValue");
    expect(HTML_NODE_TYPE.UnquotedAttributeValue.name).toBe("UnquotedAttributeValue");
    expect(HTML_NODE_TYPE.ScriptText.name).toBe("ScriptText");
    expect(HTML_NODE_TYPE.StyleText.name).toBe("StyleText");
    expect(HTML_NODE_TYPE.SelfClosingTag.name).toBe("SelfClosingTag");
  });

  it("Lezer JavaScript test", () => {
    expect(JS_NODE_TYPE.String.name).toBe("String");
    expect(JS_NODE_TYPE.Equals.name).toBe("Equals");
    expect(JS_NODE_TYPE.Import.name).toBe("import");
    expect(JS_NODE_TYPE.JSXIdentifier.name).toBe("JSXIdentifier");
    expect(JS_NODE_TYPE.JSXAttribute.name).toBe("JSXAttribute");
    expect(JS_NODE_TYPE.JSXAttributeValue.name).toBe("JSXAttributeValue");
    expect(JS_NODE_TYPE.ImportDeclaration.name).toBe("ImportDeclaration");
  });

  it("Lezer PHP test", () => {
    expect(PHP_NODE_TYPE.Text.name).toBe("Text");
  });
});
