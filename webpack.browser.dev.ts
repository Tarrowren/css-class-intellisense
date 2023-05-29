import Webpack from "webpack";
import browser from "./webpack/browser";

const common = {
  mode: "development",
  devtool: "inline-source-map",
  watch: true,
} satisfies Webpack.Configuration;

export default browser(common, false);
