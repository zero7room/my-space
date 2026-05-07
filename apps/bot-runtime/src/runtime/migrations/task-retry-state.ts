/**
 * Migrate a Task durable record from schemaVersion 1 → 2 by attaching a
 * default `TaskRetryState`. Idempotent: tasks already at version 2 are
 * returned unchanged.
 */
import { type Task } from '@ai-workflow/contracts';

export interface MigrationResult {
  migrated: boolean;
  task: Task;
}

export function migrateTaskToV2(raw: Task): MigrationResult {
  if (raw.schemaVersion === 2) return { migrated: false, task: raw };
  const next: Task = {
    ...raw,
    schemaVersion: 2,
    retry: raw.retry ?? { attemptCount: 0, maxRetries: 2 },
  };
  return { migrated: true, task: next };
}
