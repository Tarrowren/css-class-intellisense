import { RequestType } from "vscode-jsonrpc";

export class CustomMessages {
  static readonly FileRead = new RequestType<string, number[], void>("file/read");
  static readonly QueueInit = new RequestType<string[], void, void>("queue/init");
}

export const languages = ["html", "javascriptreact", "typescriptreact", "vue", "php", "css", "scss", "sass", "less"];
