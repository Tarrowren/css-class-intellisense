import type { RemoteConsole } from "vscode-languageserver";

export class Logger {
  private constructor(private readonly _console: RemoteConsole) {}

  error(message: string): void {
    this._console.error(message);
  }

  warn(message: string): void {
    this._console.warn(message);
  }

  info(message: string): void {
    this._console.info(message);
  }

  debug(message: string): void {
    this._console.debug(message);
  }

  static create(console: RemoteConsole): Logger {
    return new Logger(console);
  }
}
