"use strict";

const path = require("path");

/**@type {import('webpack').Configuration}*/
const config = {
    target: "node",
    entry: "./src/extension.ts",
    output: {
        path: path.resolve(__dirname, "dist"),
        filename: "extension.js",
        libraryTarget: "commonjs2",
        devtoolModuleFilenameTemplate: "../[resource-path]"
    },
    devtool: "source-map",
    externals: {
        vscode: "commonjs vscode",
        tree_sitter: "tree-sitter",
        tree_sitter_html: "tree-sitter-html",
        tree_sitter_css: "tree-sitter-css"
    },
    resolve: {
        extensions: [".ts", ".js"]
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                use: [
                    {
                        loader: "ts-loader",
                        options: {
                            compilerOptions: {
                                module: "es6"
                            }
                        }
                    }
                ]
            }
        ]
    }
};

module.exports = config;
