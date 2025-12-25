import "tsdown/client";

import { fileTests } from "@lezer/generator/dist/test";
import { describe, it } from "vitest";
import { parser } from "../src/parser.js";

const files = import.meta.glob<string>("./*.txt", { eager: true, query: "?raw", import: "default" });

for (const [fileName, file] of Object.entries(files)) {
  describe(fileName, () => {
    for (const { name, run } of fileTests(file, fileName)) {
      it(name, () => run(parser));
    }
  });
}
