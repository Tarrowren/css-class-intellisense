import type { CommonConfig, ProjectConfig } from "@cci/shared";
import { Uri, workspace, type ConfigurationChangeEvent, type WorkspaceFolder } from "vscode";

const _prefix = "cssci.";

const _vueLanguage = _prefix + "languages.vue";
const _useNodeFS = _prefix + "useNodeFS";

const _globalCSSFiles = _prefix + "globalCSSFiles";
const _include = _prefix + "include";
const _exclude = _prefix + "exclude";

export function getConfig(): CommonConfig {
  const vueLanguage = workspace.getConfiguration().get<boolean>(_vueLanguage, true);
  const useNodeFS = workspace.getConfiguration().get<boolean>(_useNodeFS, true);

  const folders = workspace.workspaceFolders;
  let projects: ProjectConfig[];
  if (folders && folders.length > 0) {
    projects = folders.map(getProjectConfig);
  } else {
    projects = [];
  }

  return { vueLanguage, useNodeFS, projects };
}

export function getProjectConfig(folder: WorkspaceFolder): ProjectConfig {
  const globalCSSFiles = workspace.getConfiguration(undefined, folder).get<string[]>(_globalCSSFiles, []);
  const include = workspace.getConfiguration(undefined, folder).get<string[]>(_include, []);
  const exclude = workspace.getConfiguration(undefined, folder).get<string[]>(_exclude, []);

  let folderUri = folder.uri.toString(true);
  if (!folderUri.endsWith("/")) {
    folderUri += "/";
  }
  return {
    folder: folderUri,
    globalCSSFiles: _absolute(folder.uri, globalCSSFiles),
    include,
    exclude,
  };
}

export function isNeedUpdateIndex(event: ConfigurationChangeEvent, folder: WorkspaceFolder): boolean {
  return (
    event.affectsConfiguration(_globalCSSFiles, folder) ||
    event.affectsConfiguration(_include, folder) ||
    event.affectsConfiguration(_exclude, folder)
  );
}

function _absolute(base: Uri, globalCSSFiles: string[]) {
  if (globalCSSFiles.length === 0) {
    return globalCSSFiles;
  }

  return globalCSSFiles.map((path) => {
    const uri = Uri.parse(path);

    if (uri.scheme === "file") {
      return Uri.joinPath(base, path).toString(true);
    }

    return uri.toString(true);
  });
}
