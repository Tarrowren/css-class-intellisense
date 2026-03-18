import type { CommonConfig, ProjectConfig } from "@cci/shared";
import { Uri, workspace, type ConfigurationChangeEvent, type WorkspaceFolder } from "vscode";

const _vueLanguage = "cssci.languages.vue";
const _useNodeFS = "cssci.useNodeFS";

const _globalCSSFiles = "cssci.globalCSSFiles";
const _include = "cssci.include";
const _exclude = "cssci.exclude";

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

  let _folder = folder.uri.toString(true);
  if (!_folder.endsWith("/")) {
    _folder += "/";
  }
  return {
    folder: _folder,
    globalCSSFiles: _absolute(folder.uri, globalCSSFiles),
    include,
    exclude,
  };
}

export function isNeedUpdateIndex(event: ConfigurationChangeEvent, folder: WorkspaceFolder) {
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
