export const HT = 0x09;
export const LF = 0x0a;
export const VT = 0x0b;
export const FF = 0x0c;
export const CR = 0x0d;
export const SPACE = 0x20;
export const POINT = 0x2e;
export const SHARP = 0x23;

export function isEmptyCode(code: number) {
  return code === HT || code === LF || code === VT || code === FF || code === CR || code === SPACE;
}

export function nearbyWordRange(text: string, pos: number): [number, number] | undefined {
  let start = pos;
  let end = pos;
  const length = text.length;

  for (let i = pos; i <= length; i++) {
    end = i;
    if (i === length || isEmptyCode(text.charCodeAt(i))) {
      break;
    }
  }

  for (let i = pos - 1; i >= 0; i--) {
    if (isEmptyCode(text.charCodeAt(i))) {
      break;
    }
    start = i;
  }

  if (start < end) {
    return [start, end];
  }
}

export function nearbyWord(text: string, pos: number): string | undefined {
  const range = nearbyWordRange(text, pos);
  if (range) {
    return text.substring(range[0], range[1]);
  }
}
