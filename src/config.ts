import { Disposable, EventEmitter, workspace } from "vscode";

const lightweight = "cssci.lightweight";
const vueLanguage = "cssci.languages.vue";

function getLightweight(): boolean {
  return workspace.getConfiguration().get<boolean>(lightweight, false);
}

function getVueLanguage(): boolean {
  return workspace.getConfiguration().get<boolean>(vueLanguage, true);
}

export class Configuration implements Disposable {
  private _lightweight = getLightweight();
  private _vueLanguage = getVueLanguage();

  private _on_lightweight = new EventEmitter<boolean>();
  private _on_vueLanguage = new EventEmitter<boolean>();

  private _disposable = workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration(lightweight)) {
      this._lightweight = getLightweight();
      this._on_lightweight.fire(this._lightweight);
    }

    if (e.affectsConfiguration(vueLanguage)) {
      this._vueLanguage = getVueLanguage();
      this._on_vueLanguage.fire(this._vueLanguage);
    }
  });

  get lightweight() {
    return this._lightweight;
  }

  get vueLanguage() {
    return this._vueLanguage;
  }

  get on() {
    return {
      lightweight: this._on_lightweight.event,
      vueLanguage: this._on_vueLanguage.event,
    };
  }

  dispose() {
    this._disposable.dispose();
    this._on_lightweight.dispose();
    this._on_vueLanguage.dispose();
  }
}
