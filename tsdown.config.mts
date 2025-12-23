import UnpluginTypia from "@ryoppippi/unplugin-typia/rolldown";
import { defineConfig, type TsdownInputOption, type UserConfig } from "tsdown";

function entry(type: "client" | "server", platform: "node" | "browser"): TsdownInputOption {
  return {
    [`${platform}/${type}`]: `${type}/${platform}/src/main.ts`,
  };
}

export default defineConfig(({ env }) => {
  const production = env?.NODE_ENV === "production";

  const baseBuildOptions: UserConfig = {
    outDir: "dist",
    target: "es2020",
    minify: production,
    sourcemap: !production,
  };

  const clientBuildOptions: UserConfig = {
    ...baseBuildOptions,
    external: ["vscode"],
  };

  const serverBuildOptions: UserConfig = {
    ...baseBuildOptions,
    plugins: [UnpluginTypia({})],
  };

  const nodeBuildOptions: UserConfig = {
    platform: "node",
    format: "cjs",
  };

  const browserBuildOptions: UserConfig = {
    platform: "browser",
  };

  return [
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
});
