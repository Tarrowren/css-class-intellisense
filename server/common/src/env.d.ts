declare class TextEncoder {
  readonly encoding: string;
  encode(input: string): Uint8Array;
}

declare class TextDecoder {
  readonly encoding: string;
  decode(input: Uint8Array): string;
}

declare const logger: import("vscode-languageserver").Logger;

declare const scheduler: {
  wait(ms: number, token?: import("vscode-languageserver").CancellationToken): Promise<void>;
  yield(): Promise<void>;
};

declare const performance: { now(): number };
