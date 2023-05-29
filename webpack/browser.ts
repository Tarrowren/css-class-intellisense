import { Config } from "@swc/core";
import { resolve } from "node:path";
import Webpack from "webpack";

export default function (common: Partial<Webpack.Configuration>, prod: boolean): Webpack.Configuration {
  const swcOptions = {
    jsc: {
      parser: {
        syntax: "typescript",
      },
      target: "es2020",
    },
    module: {
      type: "es6",
    },
    minify: prod,
  } satisfies Config;

  return {
    ...common,
    target: "webworker",
    entry: resolve("src", "browser", "main.ts"),
    resolve: {
      extensions: [".ts", "..."],
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          exclude: /node_modules/,
          loader: "swc-loader",
          options: swcOptions,
        },
      ],
    },
    externals: {
      vscode: "commonjs vscode",
    },
    output: {
      path: resolve("dist", "browser"),
      filename: "main.js",
      libraryTarget: "commonjs2",
    },
  };
}
