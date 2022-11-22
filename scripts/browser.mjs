import { resolve } from "path";
import webpack from "webpack";

const OUT_PATH = resolve("dist");
const MODE = "development";

webpack(
  [
    {
      mode: MODE,
      target: "webworker",
      entry: {
        "browser/main": resolve("src", "browser", "main.ts"),
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
      externals: {
        vscode: "commonjs vscode",
      },
      output: {
        path: OUT_PATH,
        libraryTarget: "commonjs",
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
