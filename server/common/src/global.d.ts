declare class TextEncoder {
  readonly encoding: string;
  encode(input: string): Uint8Array;
}

declare class TextDecoder {
  readonly encoding: string;
  decode(input: Uint8Array): string;
}

declare const console: {
  error(...data: unknown[]): void;
  warn(...data: unknown[]): void;
  info(...data: unknown[]): void;
  log(...data: unknown[]): void;
  debug(...data: unknown[]): void;
};

declare const performance: { now(): number };
