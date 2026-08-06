export class CancellationError extends Error {
  constructor() {
    super("cancelled");
  }
}
