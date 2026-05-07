/**
 * `_index/task-thread.json` is a runtime-maintained map of `taskId → threadId`.
 * Routes use it to skip the O(threads * tasks) scan in `loadTask`. The index is
 * append-on-create + load-on-boot via the recovery scan; if missing it is
 * rebuilt by enumerating threads.
 */
import path from 'node:path';

import { atomicWriteJson, ensureDir, readJson } from '@ai-workflow/fs-store';

import type { RuntimePaths } from './paths.js';

const INDEX_FILE = 'task-thread.json';

export class TaskIndex {
  private map = new Map<string, string>();
  private loaded = false;
  constructor(private readonly rt: RuntimePaths) {}

  private filePath(): string {
    return path.join(this.rt.paths.indexRoot(), INDEX_FILE);
  }

  async load(): Promise<void> {
    await ensureDir(this.rt.paths.indexRoot());
    const raw = await readJson<Record<string, string>>(this.filePath());
    if (raw) {
      this.map = new Map(Object.entries(raw));
    } else {
      // Rebuild from disk.
      const threads = await this.rt.threads.list();
      for (const t of threads) {
        const tasks = await this.rt.tasks.listForThread(t.id);
        for (const ta of tasks) this.map.set(ta.id, t.id);
      }
      await this.flush();
    }
    this.loaded = true;
  }

  threadFor(taskId: string): string | undefined {
    return this.map.get(taskId);
  }

  async note(taskId: string, threadId: string): Promise<void> {
    if (!this.loaded) await this.load();
    if (this.map.get(taskId) === threadId) return;
    this.map.set(taskId, threadId);
    await this.flush();
  }

  async forget(taskId: string): Promise<void> {
    if (!this.loaded) await this.load();
    if (!this.map.has(taskId)) return;
    this.map.delete(taskId);
    await this.flush();
  }

  size(): number {
    return this.map.size;
  }

  private async flush(): Promise<void> {
    await atomicWriteJson(
      this.filePath(),
      Object.fromEntries(this.map.entries()),
    );
  }
}
