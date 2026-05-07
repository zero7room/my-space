/**
 * Repository layer over the filesystem store. Each repo validates against
 * `@ai-workflow/contracts` Zod schemas before persisting and exposes
 * narrow CRUD methods needed by ThreadLoop, Executor, API, etc.
 *
 * Cross-record invariants (e.g. "TaskList orderedTaskIds matches tasks/")
 * live in `recovery.ts`, not here.
 */

export interface RepoLogger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

export const noopLogger: RepoLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

export interface Clock {
  now(): Date;
  iso(): string;
}

export const systemClock: Clock = {
  now: () => new Date(),
  iso: () => new Date().toISOString(),
};
