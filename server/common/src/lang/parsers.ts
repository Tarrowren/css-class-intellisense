import { parser as lessParser } from "@cci/lezer-less";
import { parser as classNamesParser } from "@cci/lezer-used-name";
import { parseMixed, type Input, type NestedParse, type SyntaxNode } from "@lezer/common";
import { parser as cssParser } from "@lezer/css";
import { parser as htmlParser } from "@lezer/html";
import { parser as jsParser } from "@lezer/javascript";
import type { LRParser } from "@lezer/lr";
import { parser as phpParser } from "@lezer/php";
import { parser as scssParser } from "@lezer/sass";

function _getClassNamesParser() {
  return classNamesParser;
}
const _getIdNameParser = _lazy(() => classNamesParser.configure({ top: "IdAttributeValue" }));

function _getJsParser() {
  return jsParser;
}
const _getTsParser = _lazy(() => jsParser.configure({ dialect: "ts" }));

export const getHtmlParser = _lazy(() =>
  htmlParser.configure({
    wrap: parseMixed((node, input) => {
      if (node.type.is("StyleText")) {
        return { parser: getCssParser() };
      }

      if (node.type.is("AttributeValue") || node.type.is("UnquotedAttributeValue")) {
        const attr = node.node.parent;
        if (attr && attr.type.is("Attribute")) {
          const attrName = attr.getChild("AttributeName");
          if (attrName) {
            const name = input.read(attrName.from, attrName.to);
            switch (name) {
              case "class":
                return { parser: _getClassNamesParser() };
              case "id":
                return { parser: _getIdNameParser() };
              default:
                return null;
            }
          }
        }
      }

      return null;
    }),
  }),
);

export const getPhpParser = _lazy(() =>
  phpParser.configure({
    wrap: parseMixed((node) => {
      if (node.type.is("Text")) {
        return { parser: getHtmlParser() };
      }

      return null;
    }),
  }),
);

export const getJsxParser = _lazy(() => _jsx(false));

export const getTsxParser = _lazy(() => _jsx(true));

function _jsx(ts: boolean) {
  return jsParser.configure({
    dialect: ts ? "ts jsx" : "jsx",
    wrap: parseMixed((node, input) => {
      if (node.type.is("JSXAttributeValue")) {
        const attr = node.node.parent;
        if (attr && attr.type.is("JSXAttribute")) {
          const attrName = attr.getChild("JSXIdentifier");
          if (attrName) {
            const name = input.read(attrName.from, attrName.to);
            switch (name) {
              case "class":
              case "className":
                return { parser: _getClassNamesParser() };
              case "id":
                return { parser: _getIdNameParser() };
              default:
                return null;
            }
          }
        }
      }

      return null;
    }),
  });
}

export const getVueParser = _lazy(() =>
  htmlParser.configure({
    dialect: "selfClosing",
    wrap: parseMixed((node, input) => {
      if (node.type.is("StyleText")) {
        return _vue_style(node.node, input);
      }

      if (node.type.is("ScriptText")) {
        return _vue_script(node.node, input);
      }

      if (node.type.is("AttributeValue") || node.type.is("UnquotedAttributeValue")) {
        const attr = node.node.parent;
        if (attr && attr.type.is("Attribute")) {
          const attrName = attr.getChild("AttributeName");
          if (attrName) {
            const name = input.read(attrName.from, attrName.to);
            switch (name) {
              case "class":
                return { parser: _getClassNamesParser() };
              case "id":
                return { parser: _getIdNameParser() };
              default:
                return null;
            }
          }
        }
      }

      return null;
    }),
  }),
);

function _vue_style(node: SyntaxNode, input: Input): NestedParse | null {
  const attrs = _vue_attrs(node, input);

  const lang = attrs.lang;
  const module = attrs.module;

  if (module) {
    return null;
  }

  switch (lang) {
    case "scss":
      return { parser: getScssParser() };
    case "sass":
      return { parser: getSassParser() };
    case "less":
      return { parser: getLessParser() };
    default:
      return { parser: getCssParser() };
  }
}

function _vue_script(node: SyntaxNode, input: Input): NestedParse {
  const lang = _vue_attrs(node, input).lang;
  switch (lang) {
    case "jsx":
      return { parser: getJsxParser() };
    case "ts":
      return { parser: _getTsParser() };
    case "tsx":
      return { parser: getTsxParser() };
    default:
      return { parser: _getJsParser() };
  }
}

function _vue_attrs(node: SyntaxNode, input: Input): Record<string, string> {
  const elNode = node.parent;
  if (!elNode) {
    return {};
  }

  const openTagNode = elNode.firstChild;
  if (!openTagNode) {
    return {};
  }

  const result: Record<string, string> = {};
  for (const att of openTagNode.getChildren("Attribute")) {
    const attNameNode = att.getChild("AttributeName");
    if (!attNameNode) {
      continue;
    }

    const attName = input.read(attNameNode.from, attNameNode.to);

    let attValueNode: SyntaxNode | null;
    if ((attValueNode = att.getChild("AttributeValue"))) {
      result[attName] = input.read(attValueNode.from, attValueNode.to).slice(1, -1);
    } else if ((attValueNode = att.getChild("UnquotedAttributeValue"))) {
      result[attName] = input.read(attValueNode.from, attValueNode.to);
    } else {
      result[attName] = "true";
    }
  }
  return result;
}

export function getCssParser() {
  return cssParser;
}

export function getLessParser() {
  return lessParser;
}

export const getSassParser = _lazy(() => scssParser.configure({ dialect: "indented" }));

export function getScssParser() {
  return scssParser;
}

function _lazy(create: () => LRParser) {
  let _parser: LRParser | undefined;
  return () => {
    if (!_parser) {
      _parser = create();
    }
    return _parser;
  };
}
