import { Disposable } from "vscode";

const generateId = (() => {
  let id = 1;
  return () => id++;
})();

const cache = new Map<number, [(...args: any) => void, any[]]>();
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

export function setImmediate<TArgs extends any[]>(callback: (...args: TArgs) => void, ...args: TArgs): Disposable {
  const id = generateId();
  cache.set(id, [callback, args]);
  channel.port1.postMessage(id);
  return new Disposable(() => {
    cache.delete(id);
  });
}
