import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    files: [
      "shared/src/**/*.ts",
      "client/common/src/**/*.ts",
      "client/node/src/**/*.ts",
      "client/browser/src/**/*.ts",
      "server/common/src/**/*.ts",
      "server/node/src/**/*.ts",
      "server/browser/src/**/*.ts",
    ],
  },
  { ignores: ["*.ts", "dist"] },
  eslint.configs.recommended,
  tseslint.configs.recommended,
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
