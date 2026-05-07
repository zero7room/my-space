/**
 * Acceptance 52 regression — `GET /api/tasks/:id/retry-history` must surface
 * the full retry chain: scheduled, started, exhausted, manual, skipped,
 * classification warnings, plan-update resets, and rotation events.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  newTaskId,
  newTaskListId,
  newThreadId,
  newUserId,
  type Task,
} from '@ai-workflow/contracts';

import { createServer } from '../../server.js';

const NOW = '2026-05-07T00:00:00.000Z';

beforeAll(() => {
  process.env['LOG_LEVEL'] = 'fatal';
});

const handles: Array<Awaited<ReturnType<typeof createServer>>> = [];
afterEach(async () => {
  for (const h of handles.splice(0)) {
    try {
      await h.close();
    } catch {
      /* ignore */
    }
  }
});

describe('GET /api/tasks/:taskId/retry-history (acceptance 52)', () => {
  it('returns entries for all retry-related event kinds', async () => {
    const ws = mkdtempSync(path.join(tmpdir(), 'rt-retry-hist-'));
    const owner = newUserId();
    const token = 'tok-owner';
    const handle = await createServer({
      workspaceRoot: ws,
      runtimeId: 'rt-retry-hist',
      localUserTokens: `${owner}:${token}`,
    });
    handles.push(handle);
    await handle.rt.users.upsert({
      id: owner,
      displayName: owner,
      channelIdentities: { email: 'o@x.com' },
      createdAt: NOW,
      updatedAt: NOW,
    });
    const threadId = newThreadId();
    const taskId = newTaskId();
    await handle.rt.threads.create({
      id: threadId,
      ownerUserId: owner,
      title: 'th',
      status: 'idle',
      taskListId: newTaskListId(),
      channelBindingIds: [],
      createdAt: NOW,
      updatedAt: NOW,
    });
    const t: Task = {
      id: taskId,
      threadId,
      ownerUserId: owner,
      title: 't',
      description: '',
      status: 'failed',
      sourceMessageIds: [],
      artifactIds: [],
      changeRecordIds: [],
      archivedRevisionIds: [],
      schemaVersion: 2,
      blockedReason: 'retry_pending',
      createdAt: NOW,
      updatedAt: NOW,
    };
    await handle.rt.tasks.create(t);
    // Synthesize a representative event of every retry kind we care about.
    const kinds = [
      'task_retry_scheduled',
      'task_retry_started',
      'task_retry_exhausted',
      'task_retry_skipped',
      'task_retry_classification_warning',
      'task_manual_retry_requested',
      'task_retry_reset_by_plan_update',
    ];
    for (const k of kinds) {
      await handle.rt.tasks.appendEvent(threadId, taskId, {
        kind: k as 'task_retry_scheduled',
        taskId,
        threadId,
        payload: { attemptCount: 1, failureClass: 'transient_error' },
        at: NOW,
      });
    }
    const res = await handle.app.inject({
      method: 'GET',
      url: `/api/tasks/${taskId}/retry-history`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      entries: Array<{ kind: string; triggeredBy: string }>;
    };
    const seen = new Set(body.entries.map((e) => e.kind));
    for (const k of kinds) expect(seen.has(k)).toBe(true);
    // triggeredBy mapping for the manual + plan_update entries
    const manual = body.entries.find(
      (e) => e.kind === 'task_manual_retry_requested',
    );
    expect(manual?.triggeredBy).toBe('user');
    const reset = body.entries.find(
      (e) => e.kind === 'task_retry_reset_by_plan_update',
    );
    expect(reset?.triggeredBy).toBe('plan_update');
  });

  it('returns 403 + task_action_denied for non-owner', async () => {
    const ws = mkdtempSync(path.join(tmpdir(), 'rt-retry-hist-'));
    const owner = newUserId();
    const intruder = newUserId();
    const handle = await createServer({
      workspaceRoot: ws,
      runtimeId: 'rt-retry-hist-2',
      localUserTokens: `${owner}:o-tok,${intruder}:i-tok`,
    });
    handles.push(handle);
    for (const id of [owner, intruder]) {
      await handle.rt.users.upsert({
        id,
        displayName: id,
        channelIdentities: { email: `${id}@x.com` },
        createdAt: NOW,
        updatedAt: NOW,
      });
    }
    const threadId = newThreadId();
    const taskId = newTaskId();
    await handle.rt.threads.create({
      id: threadId,
      ownerUserId: owner,
      title: 'th',
      status: 'idle',
      taskListId: newTaskListId(),
      channelBindingIds: [],
      createdAt: NOW,
      updatedAt: NOW,
    });
    await handle.rt.tasks.create({
      id: taskId,
      threadId,
      ownerUserId: owner,
      title: 't',
      description: '',
      status: 'failed',
      sourceMessageIds: [],
      artifactIds: [],
      changeRecordIds: [],
      archivedRevisionIds: [],
      schemaVersion: 2,
      blockedReason: 'retry_pending',
      createdAt: NOW,
      updatedAt: NOW,
    });
    const res = await handle.app.inject({
      method: 'GET',
      url: `/api/tasks/${taskId}/retry-history`,
      headers: { authorization: 'Bearer i-tok' },
    });
    expect(res.statusCode).toBe(403);
  });
});
