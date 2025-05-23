declare class TextEncoder {
  readonly encoding: string;
  encode(input: string): Uint8Array;
}

declare class TextDecoder {
  readonly encoding: string;
  decode(input: Uint8Array): string;
}
