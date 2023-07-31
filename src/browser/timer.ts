import { Disposable } from "vscode";

class GenerateId {
  private _id = 1;

  next() {
    return this._id++;
  }
}

const generateId = new GenerateId();

const cache = new Map<number, [Function, unknown[]]>();
const channel = new MessageChannel();

channel.port2.onmessage = (e) => {
  const id: number = e.data;
  const task = cache.get(id);
  if (task) {
    try {
      task[0](...task[1]);
    } finally {
      cache.delete(id);
    }
  }
};

export function setImmediate<TArgs extends unknown[]>(callback: (...args: TArgs) => void, ...args: TArgs): Disposable {
  const id = generateId.next();
  cache.set(id, [callback, args]);
  channel.port1.postMessage(id);
  return new Disposable(() => {
    cache.delete(id);
  });
}
