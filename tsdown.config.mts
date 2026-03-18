import UnpluginTypia from "@typia/unplugin/rolldown";
import { defineConfig, mergeConfig, type TsdownInputOption, type UserConfig } from "tsdown";

function entry(type: "client" | "server", platform: "node" | "browser"): TsdownInputOption {
  return {
    [`${platform}/${type}`]: `${type}/${platform}/src/main.ts`,
  };
}

export default defineConfig(({ env }) => {
  const production = env?.NODE_ENV === "production";
  const platform = env?.PLATFORM;

  const baseBuildOptions: UserConfig = {
    outDir: "dist",
    target: "es2020",
    minify: production,
    sourcemap: !production,
    clean: production,
    deps: { onlyBundle: false },
  };

  const clientBuildOptions = mergeConfig(baseBuildOptions, {
    deps: { neverBundle: ["vscode"] },
  });

  const serverBuildOptions = mergeConfig(baseBuildOptions, {
    plugins: [UnpluginTypia({ cache: true })],
  });

  const nodeBuildOptions: UserConfig = {
    platform: "node",
    format: "cjs",
  };

  const browserBuildOptions: UserConfig = {
    platform: "browser",
  };

  const node: UserConfig[] = [
    {
      ...clientBuildOptions,
      ...nodeBuildOptions,
      entry: entry("client", "node"),
    },
    {
      ...serverBuildOptions,
      ...nodeBuildOptions,
      entry: entry("server", "node"),
    },
  ];

  const browser: UserConfig[] = [
    {
      ...clientBuildOptions,
      ...browserBuildOptions,
      format: "umd",
      outputOptions: {
        name: "css-class-intellisense-client",
        globals: { vscode: "vscode" },
      },
      entry: entry("client", "browser"),
    },
    {
      ...serverBuildOptions,
      ...browserBuildOptions,
      format: "iife",
      entry: entry("server", "browser"),
    },
  ];

  switch (platform) {
    case "node":
      return node;
    case "browser":
      return browser;
    default:
      return [...node, ...browser];
  }
});
