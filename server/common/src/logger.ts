import { Trace, type RemoteConsole } from "vscode-languageserver";

export class Logger {
  private _level: Trace = Trace.Messages;
  private constructor(private readonly _console: RemoteConsole) {}

  error(message: string): void {
    if (this._level >= Trace.Off) {
      this._console.error(message);
    }
  }

  warn(message: string): void {
    if (this._level >= Trace.Off) {
      this._console.warn(message);
    }
  }

  info(message: string): void {
    if (this._level >= Trace.Messages) {
      this._console.info(message);
    }
  }

  debug(message: string): void {
    if (this._level >= Trace.Verbose) {
      this._console.debug(message);
    }
  }

  static create(console: RemoteConsole): Logger {
    return new Logger(console);
  }
}
