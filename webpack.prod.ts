import TerserPlugin from "terser-webpack-plugin";
import Webpack from "webpack";
import browser from "./webpack/browser";
import node from "./webpack/node";

const common = {
  mode: "production",
  devtool: false,
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        minify: TerserPlugin.swcMinify,
        terserOptions: {},
      }),
    ],
  },
} satisfies Webpack.Configuration;

export default [browser(common, true), node(common, true)];
