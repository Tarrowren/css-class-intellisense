import { Disposable, type Connection } from "vscode-languageserver";

export class Configuration implements Disposable {
  readonly parallel: number = concurrency;

  constructor(private readonly _connection: Connection) {}

  dispose(): void {}
}
