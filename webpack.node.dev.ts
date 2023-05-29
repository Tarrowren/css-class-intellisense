import Webpack from "webpack";
import node from "./webpack/node";

const common = {
  mode: "development",
  devtool: "inline-source-map",
  watch: true,
} satisfies Webpack.Configuration;

export default node(common, false);
