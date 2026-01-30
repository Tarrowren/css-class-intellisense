import { Disposable, EventEmitter, workspace } from "vscode";

const lightweight = "cssci.lightweight";

export class Configuration implements Disposable {
  private _lightweight = workspace.getConfiguration().get<boolean>(lightweight, false);
  private _on_lightweight = new EventEmitter<boolean>();
  private _disposable = workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration(lightweight)) {
      this._lightweight = workspace.getConfiguration().get<boolean>(lightweight, false);
      this._on_lightweight.fire(this._lightweight);
    }
  });

  get lightweight() {
    return this._lightweight;
  }

  get on() {
    return {
      lightweight: this._on_lightweight.event,
    };
  }

  dispose() {
    this._disposable.dispose();
    this._on_lightweight.dispose();
  }
}
