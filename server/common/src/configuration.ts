import { CustomMessages, type ProjectConfig } from "@cci/shared";
import { Disposable, DocumentUri, type Connection } from "vscode-languageserver";

export class Configuration implements Disposable {
  vueLanguage: boolean = true;
  useNodeFS: boolean = true;
  projects: ProjectConfig[] = [];

  constructor(connection: Connection) {
    connection.onRequest(CustomMessages.ConfigUpdate, (config) => {
      this.vueLanguage = config.vueLanguage;
      this.useNodeFS = config.useNodeFS;
      this.projects = config.projects;
    });
  }

  global(base: DocumentUri): ReadonlyArray<DocumentUri> {
    const config = this.projects.find((v) => base.startsWith(v.folder));
    if (!config) {
      return [];
    }

    return config.globalCSSFiles;
  }

  dispose(): void {}
}
