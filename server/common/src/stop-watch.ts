export class StopWatch {
  private constructor() {}

  private readonly _start = performance.now();
  private _elapsed: number | null = null;

  private _stop(): number {
    if (this._elapsed === null) {
      this._elapsed = performance.now() - this._start;
    }

    return this._elapsed;
  }

  elapsed(fractionDigits: number): string;
  elapsed(): number;
  elapsed(fractionDigits?: number): number | string {
    if (fractionDigits) {
      return this._stop().toFixed(fractionDigits) + "ms";
    } else {
      return this._stop();
    }
  }

  static create(): StopWatch {
    return new StopWatch();
  }
}
