import { context, type BuildContext, type BuildOptions, type Plugin } from "esbuild";
import minimist from "minimist";
import { rm } from "node:fs/promises";

const args = minimist(process.argv.slice(2), { boolean: ["watch", "production"] });
const watch = !!args.watch;
const production = !!args.production;
const modules = args._;

const ProblemMatcherPlugin: Plugin = {
  name: "esbuild-problem-matcher",
  setup(build) {
    build.onStart(() => {
      console.log("[watch] build started");
    });
    build.onEnd((result) => {
      for (const { text, location } of result.errors) {
        if (location) {
          console.error(`${location.file} ${location.line}:${location.column} - [error] ${text}`);
        } else {
          console.error(`unknown 0:0 - [error] ${text}`);
        }
      }
      console.log("[watch] build finished");
    });
  },
};

const baseBuildOptions: BuildOptions = {
  bundle: true,
  target: "es2020",
  minify: production,
  sourcemap: production ? false : "linked",
  logLevel: watch ? "silent" : "info",
  plugins: watch ? [ProblemMatcherPlugin] : [],
};

const clientBuildOptions: BuildOptions = {
  ...baseBuildOptions,
  format: "cjs",
  external: ["vscode"],
};

const serverBuildOptions: BuildOptions = {
  ...baseBuildOptions,
};

const options: BuildOptions[] = [];

if (modules.length === 0 || modules.includes("node-client")) {
  options.push({
    ...clientBuildOptions,
    platform: "node",
    entryPoints: ["client/node/src/main.ts"],
    outfile: "dist/node/client.js",
  });
}

if (modules.length === 0 || modules.includes("node-server")) {
  options.push({
    ...serverBuildOptions,
    format: "cjs",
    platform: "node",
    entryPoints: ["server/node/src/main.ts"],
    outfile: "dist/node/server.js",
  });
}

if (modules.length === 0 || modules.includes("browser-client")) {
  options.push({
    ...clientBuildOptions,
    entryPoints: ["client/browser/src/main.ts"],
    outfile: "dist/browser/client.js",
  });
}

if (modules.length === 0 || modules.includes("browser-server")) {
  options.push({
    ...serverBuildOptions,
    format: "iife",
    entryPoints: ["server/browser/src/main.ts"],
    outfile: "dist/browser/server.js",
  });
}

const contexts: BuildContext[] = await Promise.all(options.map(context));

if (production) {
  await rm("dist", { recursive: true, force: true });
}

if (watch) {
  await Promise.all(contexts.map(_watch));
} else {
  for (const ctx of contexts) {
    await _build(ctx);
  }
}

async function _watch(context: BuildContext): Promise<void> {
  process.on("SIGINT", async () => {
    await context.dispose();
    console.log("[watch] dispose");
  });

  try {
    await context.watch();
  } catch (_e) {}
}

async function _build(context: BuildContext): Promise<void> {
  try {
    await context.rebuild();
  } catch (_e) {
    process.exitCode = 1;
  }
  await context.dispose();
}
