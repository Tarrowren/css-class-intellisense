import { workspace } from "vscode";

export function enableReverseCompletion(): boolean {
  return workspace.getConfiguration().get<boolean>("cssci.features.reverseCompletion", true);
}
