import { RequestType } from "vscode-jsonrpc";

export class CustomMessages {
  static readonly FileRead = new RequestType<string, number[], void>("file/read");
  static readonly QueueInit = new RequestType<string[], void, void>("queue/init");

  static readonly ConfigUpdate = new RequestType<CommonConfig, void, void>("config/update");
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
  databaseName: string;
  storagePath?: string;
  l10nLocation?: string;
}
