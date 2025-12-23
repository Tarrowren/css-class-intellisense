import { includeIgnoreFile } from "@eslint/compat";
import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import { resolve } from "node:path";
import ts from "typescript-eslint";

export default defineConfig(
  {
    files: [
      "lezer/used-name/test/**/*.ts",
      "shared/src/**/*.ts",
      "client/common/src/**/*.ts",
      "client/node/src/**/*.ts",
      "client/browser/src/**/*.ts",
      "server/common/src/**/*.ts",
      "server/node/src/**/*.ts",
      "server/browser/src/**/*.ts",
    ],
  },
  includeIgnoreFile(resolve(".gitignore")),
  { ignores: ["*.config.mts", "lezer/used-name/src/**/*"] },
  js.configs.recommended,
  ts.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-unsafe-function-type": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          args: "all",
          argsIgnorePattern: "^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      curly: "error",
      eqeqeq: "error",
      "no-throw-literal": "error",
    },
  },
);
