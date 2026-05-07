/**
 * Acceptance #43 — manual retry resets the per-key notify throttle window for
 * all 4 notificationKinds so the user's manual-retry decision is not muted by
 * a stale window.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  newTaskId,
  newThreadId,
  newUserId,
  newTaskListId,
} from '@ai-workflow/contracts';

import { RuntimePaths } from '../../runtime/paths.js';
import { ThreadLoop } from '../thread-loop.js';
import { NotifyThrottle } from '../../retry/notify-throttle.js';

describe('manual_retry resets notify throttle (acceptance #43)', () => {
  it('clears all 4 notificationKinds for each provider/target after manual_retry', async () => {
    const ws = mkdtempSync(path.join(tmpdir(), 'tl-throttle-'));
    const rt = new RuntimePaths({ workspaceRoot: ws, runtimeId: 'rt-tl' });
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
      status: 'failed',
      blockedReason: 'retry_exhausted',
      sourceMessageIds: [],
      artifactIds: [],
      changeRecordIds: [],
      archivedRevisionIds: [],
      schemaVersion: 2,
      createdAt: '2026-05-07T00:00:00.000Z',
      updatedAt: '2026-05-07T00:00:00.000Z',
    });

    const throttle = new NotifyThrottle({ capacity: 1, refillPerSec: 0 });
    // Exhaust the per-key bucket for each kind.
    const provider = 'feishu';
    const externalId = 'ou_target_x';
    const kinds = [
      'task_blocked',
      'task_completed',
      'task_failed',
      'critical_node_required',
    ];
    for (const k of kinds) {
      expect(
        throttle.consume({ provider, externalId, taskId, notificationKind: k }),
      ).toBe(true);
      // Now bucket is empty.
      expect(
        throttle.consume({ provider, externalId, taskId, notificationKind: k }),
      ).toBe(false);
    }

    // Drive a manual_retry signal through the loop.
    await rt.tasks.writeControl(threadId, taskId, {
      taskId,
      pendingSignals: [
        {
          kind: 'manual_retry',
          messageId: 'msg_aaaaaaaaaaaaaaaaaaaaa',
          userId: ownerUserId,
          createdAt: '2026-05-07T00:00:01.000Z',
        },
      ],
      updatedAt: '2026-05-07T00:00:01.000Z',
    });

    const tl = new ThreadLoop({
      rt,
      notifyThrottle: throttle,
      resolveBindings: async () => [{ provider, externalId }],
    });
    await tl.runOnce(threadId, taskId);

    // After reset, each kind should be allowed once more.
    for (const k of kinds) {
      expect(
        throttle.consume({ provider, externalId, taskId, notificationKind: k }),
      ).toBe(true);
    }
  });
});
