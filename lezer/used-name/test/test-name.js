import { fileTests } from "@lezer/generator/dist/test";
import { describe, it } from "mocha";
import { parser } from "../src/parser.js";

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
const caseDir = path.dirname(fileURLToPath(import.meta.url));

for (const file of fs.readdirSync(caseDir)) {
  if (!/\.txt$/.test(file)) {
    continue;
  }

  const name = file;
  describe(name, () => {
    for (const { name, run } of fileTests(fs.readFileSync(path.join(caseDir, file), "utf8"), file)) {
      it(name, () => run(parser));
    }
  });
}
