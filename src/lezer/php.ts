import * as LEZER_PHP from "@lezer/php";

const types = LEZER_PHP.parser.nodeSet.types;

export const PHP_NODE_TYPE = {
  Text: types[70],
};
