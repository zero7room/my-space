/**
 * Per-key cooperative mutex used to serialize writes to a particular file or
 * resource within a single Node process. NOT a cross-process lock — see
 * `locks.ts` for that.
 */

type Resolver = () => void;

export class KeyedMutex {
  private readonly waiters = new Map<string, Resolver[]>();

  async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    await this.acquire(key);
    try {
      return await fn();
    } finally {
      this.release(key);
    }
  }

  private acquire(key: string): Promise<void> {
    return new Promise<void>((resolve) => {
      const queue = this.waiters.get(key);
      if (!queue) {
        // No one holds it — open a new (empty) queue and let caller proceed.
        this.waiters.set(key, []);
        resolve();
        return;
      }
      queue.push(resolve);
    });
  }

  private release(key: string): void {
    const queue = this.waiters.get(key);
    if (!queue) return;
    if (queue.length === 0) {
      this.waiters.delete(key);
      return;
    }
    const next = queue.shift()!;
    next();
  }
}
