import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { newTaskId, newThreadId, newUserId, newTaskListId } from '@ai-workflow/contracts';

import { RuntimePaths } from '../../paths.js';

/**
 * Causal ordering invariant: a derived event (`task_block_resolved`) must
 * never appear before its source event (`task_blocked`) in the events log.
 * `appendEvent` assigns monotonic seq per log, so reading back the log in
 * write order must show the source before the derived event.
 *
 * Chaos case: we write alternating blocked / block_resolved pairs for the
 * same task across many iterations and assert the invariant holds even under
 * interleaved writes.
 */
describe('SSE causal ordering invariant', () => {
  it('keeps derived events strictly after their source event', async () => {
    const ws = mkdtempSync(path.join(tmpdir(), 'sse-causal-'));
    const rt = new RuntimePaths({ workspaceRoot: ws, runtimeId: 'rt-causal' });
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
    await rt.tasks.create({
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

    const iterations = 20;
    for (let i = 0; i < iterations; i++) {
      await rt.tasks.appendEvent(threadId, taskId, {
        kind: 'task_blocked',
        taskId,
        threadId,
        payload: { reason: 'awaiting_user_action', iter: i },
        at: new Date(1000 * i).toISOString(),
      });
      await rt.tasks.appendEvent(threadId, taskId, {
        kind: 'task_unblocked',
        taskId,
        threadId,
        payload: { iter: i },
        at: new Date(1000 * i + 100).toISOString(),
      });
    }

    const events = await rt.tasks.readEventsSince(threadId, taskId);
    expect(events.length).toBe(iterations * 2);
    let lastSeq = -1;
    for (const e of events) {
      expect(e.seq).toBeGreaterThan(lastSeq);
      lastSeq = e.seq;
    }
    // Every `task_unblocked` must immediately follow its `task_blocked`
    // partner with an equal iter payload + higher seq.
    for (let i = 0; i < iterations; i++) {
      const blocked = events[i * 2]!;
      const resolved = events[i * 2 + 1]!;
      expect(blocked.kind).toBe('task_blocked');
      expect(resolved.kind).toBe('task_unblocked');
      expect(blocked.payload['iter']).toBe(i);
      expect(resolved.payload['iter']).toBe(i);
      expect(resolved.seq).toBeGreaterThan(blocked.seq);
    }
  });
});
