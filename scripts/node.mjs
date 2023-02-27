// @ts-check

import { rm } from "fs/promises";
import { resolve } from "path";
import TerserPlugin from "terser-webpack-plugin";
import webpack from "webpack";

const mode = process.env.NODE_ENV === "production" ? "production" : "none";
const watch = !!process.env.WEBPACK_WATCH;

await rm(resolve("dist", "node"), { recursive: true, force: true });

webpack(
  {
    mode,
    watch,
    target: "node",
    entry: resolve("src", "node", "main.ts"),
    resolve: {
      extensions: [".ts", "..."],
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          exclude: /node_modules/,
          loader: "ts-loader",
        },
      ],
    },
    externals: {
      vscode: "commonjs vscode",
    },
    output: {
      path: resolve("dist", "node"),
      filename: "main.js",
      libraryTarget: "commonjs2",
    },
    devtool: mode === "production" ? false : "source-map",
    infrastructureLogging: {
      level: "log",
    },
    optimization: {
      minimizer: [
        new TerserPlugin({
          extractComments: false,
        }),
      ],
    },
  },
  (err, stats) => {
    if (err) {
      console.error(err.message);
    } else {
      if (stats) {
        console.log(stats.toString({ chunks: false, colors: true }));
      }
    }
  }
);
