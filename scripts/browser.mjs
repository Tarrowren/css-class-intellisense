import { resolve } from "path";
import { fileURLToPath } from "url";
import webpack from "webpack";

const OUT_PATH = resolve("dist");

webpack(
  [
    {
      mode: "none",
      target: "webworker",
      entry: {
        "client/browser/main": resolve("src", "client", "browser", "main.ts"),
      },
      resolve: {
        extensions: [".ts", "..."],
        fallback: {
          path: fileURLToPath(await import.meta.resolve("path-browserify")),
        },
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
        path: OUT_PATH,
        libraryTarget: "commonjs",
      },
    },
    {
      mode: "none",
      target: "webworker",
      entry: {
        "server/browser/main": resolve("src", "server", "browser", "main.ts"),
      },
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
      output: {
        path: OUT_PATH,
        libraryTarget: "var",
        library: "serverExportVar",
      },
    },
  ],
  (err, stats) => {
    if (err) {
      console.error(err.message);
    } else {
      console.log(stats.toString({ chunks: false, colors: true }));
    }
  }
);
