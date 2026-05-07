import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  newTaskId,
  newThreadId,
  newUserId,
  type Task,
} from '@ai-workflow/contracts';

import { migrateTaskToV2 } from '../migrations/task-retry-state.js';
import { RuntimePaths } from '../paths.js';
import { RecoveryScanner } from '../recovery.js';

const NOW = '2026-05-07T00:00:00.000Z';

function mkrt(): RuntimePaths {
  return new RuntimePaths({
    workspaceRoot: mkdtempSync(path.join(tmpdir(), 'rt-mig-')),
    runtimeId: 'rt-mig',
  });
}

function v1Task(threadId: string, taskId: string): Task {
  return {
    id: taskId,
    threadId,
    ownerUserId: newUserId(),
    title: 't',
    description: '',
    status: 'queued',
    sourceMessageIds: [],
    artifactIds: [],
    changeRecordIds: [],
    archivedRevisionIds: [],
    schemaVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe('migrateTaskToV2 unit', () => {
  it('is a noop when schemaVersion=2 and retry present', () => {
    const t: Task = {
      ...v1Task(newThreadId(), newTaskId()),
      schemaVersion: 2,
      retry: { attemptCount: 1, maxRetries: 3 },
    };
    const r = migrateTaskToV2(t);
    expect(r.migrated).toBe(false);
    expect(r.task.retry).toEqual({ attemptCount: 1, maxRetries: 3 });
    expect(r.migratedFields).toEqual([]);
  });

  it('writes default retry {0, 2} for v1 task without legacy budget fields', () => {
    const t = v1Task(newThreadId(), newTaskId());
    const r = migrateTaskToV2(t);
    expect(r.migrated).toBe(true);
    expect(r.task.schemaVersion).toBe(2);
    expect(r.task.retry).toEqual({ attemptCount: 0, maxRetries: 2 });
    expect(r.fromVersion).toBe(1);
    expect(r.toVersion).toBe(2);
    expect(r.migratedFields).toContain('schemaVersion');
    expect(r.migratedFields).toContain('retry.maxRetries');
  });

  it('maps legacy budget.maxRetries / budget.attemptCount onto retry', () => {
    const t = v1Task(newThreadId(), newTaskId()) as Task & {
      budget: { maxRetries: number; attemptCount: number };
    };
    // Inject legacy fields that older task.json files may carry. The current
    // contract's strict budget schema rejects them on write, but the migrator
    // accepts them on read for backwards compatibility (acceptance 35).
    (t as unknown as { budget: unknown }).budget = {
      maxRetries: 5,
      attemptCount: 1,
    };
    const r = migrateTaskToV2(t);
    expect(r.task.retry).toEqual({ attemptCount: 1, maxRetries: 5 });
  });
});

describe('RecoveryScanner migration paths (acceptance 35-36)', () => {
  it('emits task_schema_migrated with migratedFields payload', async () => {
    const rt = mkrt();
    const threadId = newThreadId();
    const taskId = newTaskId();
    await rt.tasks.create(v1Task(threadId, taskId));
    const r = await new RecoveryScanner({ paths: rt.paths }).run();
    const ev = r.events.find((e) => e.kind === 'task_schema_migrated');
    expect(ev).toBeDefined();
    expect(ev?.taskId).toBe(taskId);
    const payload = ev?.payload as {
      taskId: string;
      fromVersion: number;
      toVersion: number;
      migratedFields: string[];
    };
    expect(payload.fromVersion).toBe(1);
    expect(payload.toVersion).toBe(2);
    expect(payload.migratedFields.length).toBeGreaterThan(0);
  });

  it('on persist failure leaves the v1 task untouched and writes migration-pending.json', async () => {
    const rt = mkrt();
    const threadId = newThreadId();
    const taskId = newTaskId();
    await rt.tasks.create(v1Task(threadId, taskId));
    const scanner = new RecoveryScanner({ paths: rt.paths });
    // Stub the underlying repo update used by recovery to throw.
    const originalUpdate = (
      scanner as unknown as { taskRepo: { update: (...a: unknown[]) => unknown } }
    ).taskRepo.update.bind(
      (scanner as unknown as { taskRepo: { update: () => unknown } }).taskRepo,
    );
    void originalUpdate;
    (
      scanner as unknown as { taskRepo: { update: (...a: unknown[]) => unknown } }
    ).taskRepo.update = async () => {
      throw new Error('disk full');
    };
    const r = await scanner.run();
    expect(r.tasksMigrated).toBe(0);
    expect(r.events.some((e) => e.kind === 'task_schema_migrated')).toBe(false);
    // Task remains v1 on disk
    const stored = await rt.tasks.get(threadId, taskId);
    expect(stored?.schemaVersion).toBe(1);
    // Sidecar marker exists
    const marker = path.join(
      rt.paths.taskRoot(threadId, taskId),
      'migration-pending.json',
    );
    const exists = await fs
      .stat(marker)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);
    const body = JSON.parse(await fs.readFile(marker, 'utf8'));
    expect(body.taskId).toBe(taskId);
    expect(body.toVersion).toBe(2);
  });
});
