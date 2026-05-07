/**
 * Acceptance 44 — events.jsonl rotation:
 *   - When active log exceeds RUNTIME_EVENTS_JSONL_MAX_BYTES, atomic rename to
 *     events-archive/<archive-id>.jsonl
 *   - Append events_jsonl_rotated{archivedFile, archivedSize, archivedAgeDays,
 *     reason} marker into the freshly-restarted log
 *   - archive-id format: <startTs>-<endTs>-<sha256-prefix-8>
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, existsSync, readdirSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { newTaskId, newThreadId, newUserId, newTaskListId } from '@ai-workflow/contracts';
import { RuntimePaths } from '../paths.js';
import { TaskRepository } from '../repositories/tasks.js';

describe('events.jsonl rotation (acceptance 44)', () => {
  const ORIG = process.env['RUNTIME_EVENTS_JSONL_MAX_BYTES'];

  beforeAll(() => {
    process.env['RUNTIME_EVENTS_JSONL_MAX_BYTES'] = '1024';
  });
  afterAll(() => {
    if (ORIG === undefined) delete process.env['RUNTIME_EVENTS_JSONL_MAX_BYTES'];
    else process.env['RUNTIME_EVENTS_JSONL_MAX_BYTES'] = ORIG;
  });

  it('rotates active events.jsonl after threshold and writes marker', async () => {
    const ws = mkdtempSync(path.join(tmpdir(), 'events-rot-'));
    const rt = new RuntimePaths({ workspaceRoot: ws, runtimeId: 'rt-rot' });
    const repo = new TaskRepository(rt.paths);
    const threadId = newThreadId();
    const ownerUserId = newUserId();
    const taskId = newTaskId();

    await rt.threads.create({
      id: threadId,
      ownerUserId,
      title: 't',
      status: 'idle',
      taskListId: newTaskListId(),
      channelBindingIds: [],
      createdAt: '2026-05-07T00:00:00.000Z',
      updatedAt: '2026-05-07T00:00:00.000Z',
    });
    await repo.create({
      id: taskId,
      threadId,
      ownerUserId,
      title: 't',
      description: '',
      status: 'queued',
      sourceMessageIds: [],
      artifactIds: [],
      changeRecordIds: [],
      archivedRevisionIds: [],
      schemaVersion: 2,
      createdAt: '2026-05-07T00:00:00.000Z',
      updatedAt: '2026-05-07T00:00:00.000Z',
    });

    const padding = 'x'.repeat(200);
    for (let i = 0; i < 8; i++) {
      await repo.appendEvent(threadId, taskId, {
        kind: 'task_state_transition',
        taskId,
        threadId,
        payload: { iter: i, padding },
        at: new Date(1_000_000 + i).toISOString(),
      });
    }

    const logPath = rt.paths.taskEventsLog(threadId, taskId);
    const archiveDir = path.join(path.dirname(logPath), 'events-archive');
    expect(existsSync(archiveDir)).toBe(true);
    const archives = readdirSync(archiveDir).filter((f) => f.endsWith('.jsonl'));
    expect(archives.length).toBeGreaterThanOrEqual(1);
    const aid = archives[0]!.replace(/\.jsonl$/, '');
    expect(aid.split('-').length).toBeGreaterThanOrEqual(3);

    const activeContent = await fs.readFile(logPath, 'utf8');
    expect(activeContent).toMatch(/events_jsonl_rotated/);
  });
});

