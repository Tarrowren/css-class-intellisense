import type { CommonConfig, ProjectConfig } from "@cci/shared";
import { Uri, workspace, type ConfigurationChangeEvent, type WorkspaceFolder } from "vscode";

const _prefix = "cssci.";

const _vue_language = _prefix + "languages.vue";
const _use_node_fs = _prefix + "useNodeFS";

const _global_css_files = _prefix + "globalCSSFiles";
const _include = _prefix + "include";
const _exclude = _prefix + "exclude";

export function getConfig(): CommonConfig {
  const vueLanguage = workspace.getConfiguration().get<boolean>(_vue_language, true);
  const useNodeFS = workspace.getConfiguration().get<boolean>(_use_node_fs, true);

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
  const globalCSSFiles = workspace.getConfiguration(undefined, folder).get<string[]>(_global_css_files, []);
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
    event.affectsConfiguration(_global_css_files, folder) ||
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
