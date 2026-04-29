export type EventQueue<T> = {
  push(item: T): void;
  shift(): Promise<T>;
  close(): void;
  size(): number;
};

export function createEventQueue<T>(): EventQueue<T> {
  const buffer: T[] = [];
  const waiters: Array<{
    resolve: (v: T) => void;
    reject: (e: Error) => void;
  }> = [];
  let closed = false;

  return {
    push(item) {
      if (closed) throw new Error("event queue closed");
      const w = waiters.shift();
      if (w) w.resolve(item);
      else buffer.push(item);
    },
    shift() {
      const item = buffer.shift();
      if (item !== undefined) return Promise.resolve(item);
      if (closed) return Promise.reject(new Error("event queue closed"));
      return new Promise<T>((resolve, reject) => {
        waiters.push({ resolve, reject });
      });
    },
    close() {
      closed = true;
      while (waiters.length > 0) {
        waiters.shift()?.reject(new Error("event queue closed"));
      }
    },
    size() {
      return buffer.length;
    },
  };
}
