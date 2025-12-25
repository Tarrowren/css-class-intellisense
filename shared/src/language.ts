export type LanguageId =
  | "html"
  | "javascriptreact"
  | "typescriptreact"
  | "vue"
  | "php"
  | "css"
  | "scss"
  | "sass"
  | "less";

export interface LanguageConfig {
  languageId: LanguageId;
  suffixes: ReadonlyArray<string>;
}

export const languageConfigs: ReadonlyArray<LanguageConfig> = [
  {
    languageId: "html",
    suffixes: ["html"],
  },
  {
    languageId: "javascriptreact",
    suffixes: ["jsx", "mjsx", "cjsx"],
  },
  {
    languageId: "typescriptreact",
    suffixes: ["tsx", "mtsx", "ctsx"],
  },
  {
    languageId: "vue",
    suffixes: ["vue"],
  },
  {
    languageId: "php",
    suffixes: ["php"],
  },
  {
    languageId: "css",
    suffixes: ["css"],
  },
  {
    languageId: "scss",
    suffixes: ["scss"],
  },
  {
    languageId: "sass",
    suffixes: ["sass"],
  },
  {
    languageId: "less",
    suffixes: ["less"],
  },
];
