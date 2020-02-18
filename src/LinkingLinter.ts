import { Diagnostic, EventEmitter, Uri } from "vscode";

export interface LintEvent {
    uri: Uri;
    diagnostic?: Diagnostic;
}

export class LinkingLinter {
    private _onDidChangeDiagnostics = new EventEmitter<LintEvent>();
    readonly onDidChangeDiagnostics = this._onDidChangeDiagnostics.event;

    changeDiagnostics(uri: Uri, diagnostic?: Diagnostic) {
        this._onDidChangeDiagnostics.fire({ uri, diagnostic });
    }
}
