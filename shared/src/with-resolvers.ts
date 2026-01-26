interface PromiseWithResolvers<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason: unknown) => void;
}

let withResolvers: <T>() => PromiseWithResolvers<T>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if ((Promise as any).withResolvers) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withResolvers = (Promise as any).withResolvers.bind(Promise);
} else {
  withResolvers = <T>(): PromiseWithResolvers<T> => {
    let resolve: (value: T | PromiseLike<T>) => void;
    let reject: (reason: unknown) => void;

    const promise = new Promise<T>((c, e) => {
      resolve = c;
      reject = e;
    });

    return { promise, resolve: resolve!, reject: reject! };
  };
}

export { withResolvers };
