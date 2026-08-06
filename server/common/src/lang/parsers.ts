import { parser as lessParser } from "@cci/lezer-less";
import { parser as classNamesParser } from "@cci/lezer-used-name";
import { parseMixed, type Input, type NestedParse, type SyntaxNode } from "@lezer/common";
import { parser as cssParser } from "@lezer/css";
import { parser as htmlParser } from "@lezer/html";
import { parser as jsParser } from "@lezer/javascript";
import type { LRParser } from "@lezer/lr";
import { parser as phpParser } from "@lezer/php";
import { parser as scssParser } from "@lezer/sass";

function _get_class_names_parser() {
  return classNamesParser;
}
const _get_id_name_parser = _lazy(() => classNamesParser.configure({ top: "IdAttributeValue" }));

function _get_js_parser() {
  return jsParser;
}
const _get_ts_parser = _lazy(() => jsParser.configure({ dialect: "ts" }));

export const getHtmlParser: () => LRParser = _lazy(() =>
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
                return { parser: _get_class_names_parser() };
              case "id":
                return { parser: _get_id_name_parser() };
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

export const getPhpParser: () => LRParser = _lazy(() =>
  phpParser.configure({
    wrap: parseMixed((node) => {
      if (node.type.is("Text")) {
        return { parser: getHtmlParser() };
      }

      return null;
    }),
  }),
);

export const getJsxParser: () => LRParser = _lazy(() => _jsx(false));

export const getTsxParser: () => LRParser = _lazy(() => _jsx(true));

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
                return { parser: _get_class_names_parser() };
              case "id":
                return { parser: _get_id_name_parser() };
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

export const getVueParser: () => LRParser = _lazy(() =>
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
                return { parser: _get_class_names_parser() };
              case "id":
                return { parser: _get_id_name_parser() };
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
      return { parser: _get_ts_parser() };
    case "tsx":
      return { parser: getTsxParser() };
    default:
      return { parser: _get_js_parser() };
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

export function getCssParser(): LRParser {
  return cssParser;
}

export function getLessParser(): LRParser {
  return lessParser;
}

export const getSassParser: () => LRParser = _lazy(() => scssParser.configure({ dialect: "indented" }));

export function getScssParser(): LRParser {
  return scssParser;
}

function _lazy(create: () => LRParser) {
  let _parser: LRParser | undefined;
  return (): LRParser => {
    if (!_parser) {
      _parser = create();
    }
    return _parser;
  };
}
