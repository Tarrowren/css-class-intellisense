import { RequestType } from "vscode-jsonrpc";

export class CustomMessages {
  static readonly FileRead: RequestType<string, number[], void> = new RequestType("file/read");

  static readonly ConfigUpdate: RequestType<CommonConfig, void, void> = new RequestType("config/update");
  static readonly IndexUpdate: RequestType<string[], void, void> = new RequestType("index/update");
}

export interface CommonConfig {
  readonly vueLanguage: boolean;
  readonly useNodeFS: boolean;

  readonly projects: ProjectConfig[];
}

export interface ProjectConfig {
  readonly folder: string;

  readonly globalCSSFiles: ReadonlyArray<string>;
  readonly include: ReadonlyArray<string>;
  readonly exclude: ReadonlyArray<string>;
}

export interface InitOptions {
  readonly databaseName: string;
  readonly storagePath?: string;
  readonly l10nLocation?: string;
}
