export class Spin {
  private static readonly _MIN = 16;
  private static readonly _MAX = 65536;

  private constructor(private _value: number) {}

  get value(): number {
    return this._value;
  }

  decrease(): void {
    this._value = Spin._limit(this._value >> 1);
  }

  increase(): void {
    this._value = Spin._limit(this._value + (this._value >> 4));
  }

  toString(): string {
    return this._value.toString();
  }

  private static _limit(value: number) {
    if (value < this._MIN) {
      return this._MIN;
    } else if (value > this._MAX) {
      return this._MAX;
    } else {
      return value;
    }
  }

  static create(value: number): Spin {
    return new Spin(this._limit(value));
  }
}
