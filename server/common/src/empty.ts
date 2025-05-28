export class Empty {
  private static readonly empty_array = Object.freeze<unknown[]>([]);
  static array<T>(): Array<T> {
    return this.empty_array as Array<T>;
  }
}
