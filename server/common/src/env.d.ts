declare class TextEncoder {
  readonly encoding: string;
  encode(input: string): Uint8Array;
}

declare class TextDecoder {
  readonly encoding: string;
  decode(input: Uint8Array): string;
}

declare const fs: {
  readFile?(path: string): Promise<Uint8Array>;
  readHttpFile(url: string): Promise<string>;
};

declare const console: {
  error(...data: unknown[]): void;
  warn(...data: unknown[]): void;
  info(...data: unknown[]): void;
  log(...data: unknown[]): void;
  debug(...data: unknown[]): void;
};

declare const scheduler: {
  wait(ms: number, token?: import("vscode-languageserver").CancellationToken): Promise<void>;
  yield(): Promise<void>;
};

declare const performance: { now(): number };

declare const concurrency: number;
