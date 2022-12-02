import { glob } from "glob";
import Mocha from "mocha";
import { resolve } from "node:path";
import { promisify } from "node:util";

async function run() {
  try {
    const testRoot = resolve(__dirname);

    const mocha = new Mocha({
      ui: "tdd",
      color: true,
      timeout: 60000,
    });

    const files = await promisify(glob)("**/*.test.js", { cwd: testRoot });

    files.forEach((f) => {
      mocha.addFile(resolve(testRoot, f));
    });

    const failures = await new Promise<number>((c) => {
      mocha.run(c);
    });

    if (failures > 0) {
      throw new Error(`${failures} tests failed.`);
    }
  } catch (e) {
    console.error(e);
    process.exit(-1);
  }
}

run();
