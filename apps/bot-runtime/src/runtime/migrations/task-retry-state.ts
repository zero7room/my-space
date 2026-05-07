/**
 * Migrate a Task durable record from schemaVersion 1 → 2 by attaching a
 * default `TaskRetryState`. Idempotent: tasks already at version 2 are
 * returned unchanged.
 *
 * Legacy mapping (acceptance 35):
 *   task.budget.maxRetries     → task.retry.maxRetries     (default 2)
 *   task.budget.attemptCount   → task.retry.attemptCount   (default 0)
 *   other retry fields         → empty
 *
 * Note: the current `taskBudgetSchema` does not declare `maxRetries` /
 * `attemptCount`, but historical task.json files may carry them. We accept a
 * loosely-typed input to support that mapping.
 */
import { type Task } from '@ai-workflow/contracts';

export interface MigrationResult {
  migrated: boolean;
  task: Task;
  fromVersion: number;
  toVersion: number;
  migratedFields: string[];
}

interface LegacyBudget {
  maxRetries?: unknown;
  attemptCount?: unknown;
}

function readLegacyBudgetField(
  budget: unknown,
  key: 'maxRetries' | 'attemptCount',
): number | undefined {
  if (!budget || typeof budget !== 'object') return undefined;
  const v = (budget as LegacyBudget)[key];
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined;
}

export function migrateTaskToV2(raw: Task): MigrationResult {
  const fromVersion = raw.schemaVersion ?? 1;
  if (raw.schemaVersion === 2 && raw.retry) {
    return {
      migrated: false,
      task: raw,
      fromVersion: 2,
      toVersion: 2,
      migratedFields: [],
    };
  }
  const legacyMax = readLegacyBudgetField(raw.budget, 'maxRetries');
  const legacyAttempt = readLegacyBudgetField(raw.budget, 'attemptCount');
  const maxRetries = raw.retry?.maxRetries ?? legacyMax ?? 2;
  const attemptCount = raw.retry?.attemptCount ?? legacyAttempt ?? 0;
  const migratedFields: string[] = [];
  if (raw.schemaVersion !== 2) migratedFields.push('schemaVersion');
  if (!raw.retry) {
    migratedFields.push('retry.attemptCount', 'retry.maxRetries');
  }
  const next: Task = {
    ...raw,
    schemaVersion: 2,
    retry: raw.retry ?? { attemptCount, maxRetries },
  };
  return {
    migrated: true,
    task: next,
    fromVersion,
    toVersion: 2,
    migratedFields,
  };
}
