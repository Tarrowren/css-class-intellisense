import type { CancellationToken } from "vscode-languageserver";

let _env: Env | undefined;
export function install(env: Env): void {
  _env = env;
}

export function fs(): FS {
  return _env!.fs;
}

export function os(): OS {
  return _env!.os;
}

export function scheduler(): Scheduler {
  return _env!.scheduler;
}

interface FS {
  fetchFile(url: string, token: CancellationToken): Promise<string>;
  readFile?(path: string, token: CancellationToken): Promise<Uint8Array>;
}

interface OS {
  readonly concurrency: number;
}

interface Scheduler {
  wait(ms: number, token: CancellationToken): Promise<void>;
  yield(token: CancellationToken): Promise<void>;
}

interface Env {
  readonly fs: FS;
  readonly os: OS;
  readonly scheduler: Scheduler;
}
