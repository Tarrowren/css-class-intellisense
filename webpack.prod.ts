import Webpack from "webpack";
import browser from "./webpack/browser";
import node from "./webpack/node";

const common = {
  mode: "production",
  devtool: false,
} satisfies Webpack.Configuration;

export default [browser(common, true), node(common, true)];
