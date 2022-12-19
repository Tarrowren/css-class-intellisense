import { Disposable, workspace } from "vscode";

const reverseCompletionSetting = "cssci.features.reverseCompletion";

export class Configuration implements Disposable {
  private _configListener: Disposable | null | undefined;

  private _reverseCompletion: boolean;

  constructor() {
    this._reverseCompletion = workspace.getConfiguration().get<boolean>(reverseCompletionSetting, true);

    this._configListener = workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(reverseCompletionSetting)) {
        this._reverseCompletion = workspace.getConfiguration().get<boolean>(reverseCompletionSetting, true);
      }
    });
  }

  get reverseCompletion() {
    return this._reverseCompletion;
  }

  dispose() {
    if (this._configListener) {
      this._configListener.dispose();
      this._configListener = null;
    }
  }
}
