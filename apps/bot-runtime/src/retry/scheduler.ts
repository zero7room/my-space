/**
 * Retry scheduler for `failureClass="transient_error"` only.
 *
 * Decision rules (per design.md §11):
 *   - Only auto-retry transient. Other failure classes never auto-retry.
 *   - `attemptCount` must stay ≤ `maxRetries` (default 2). When >, mark
 *     `retry_exhausted`.
 *   - Retry must NOT cascade into subagents or Agent Teams (callers passing a
 *     team-internal task must be rejected here).
 *   - `failed → queued` requires the `autoRetry` flag in `applyTaskTransition`
 *     so other code paths can't sneak retries in.
 *   - Backoff: exponential 5s, 30s, 5m (jittered ±20%).
 *
 * Recovery angle: `nextRetryAt` lives on `TaskRetryState`. The retry-scheduler
 * worker pulls failed tasks whose `nextRetryAt` is past, then re-queues.
 */
import {
  type FailureClass,
  type Task,
  type TaskRetryState,
  applyTaskTransition,
  sanitizeWithReport,
} from '@ai-workflow/contracts';

import type { RuntimePaths } from '../runtime/paths.js';
import { jaccardSimilarity } from './jaccard.js';

const BACKOFF_SCHEDULE_MS = [5_000, 30_000, 5 * 60_000];

export interface ScheduleInput {
  threadId: string;
  task: Task;
  failureClass: FailureClass;
  failureReason: string;
  /** Whether this is a team-internal context. */
  isTeamInternal?: boolean;
}

export interface RetryDecision {
  outcome: 'scheduled' | 'exhausted' | 'not_eligible';
  nextRetryAt?: string;
  retry: TaskRetryState;
}

export class RetryScheduler {
  constructor(
    private readonly rt: RuntimePaths,
    private readonly now: () => number = Date.now,
    private readonly jitterFn: () => number = Math.random,
  ) {}

  async schedule(input: ScheduleInput): Promise<RetryDecision> {
    if (input.isTeamInternal) {
      return {
        outcome: 'not_eligible',
        retry: input.task.retry ?? { attemptCount: 0, maxRetries: 2 },
      };
    }
    // Acceptance 45: PII-redact failureReason before persisting to disk /
    // events.jsonl. Truncate to 16KB to bound storage; emit a redaction event
    // when sanitizer matched anything so audit can correlate.
    const MAX_REASON_BYTES = 16 * 1024;
    let failureReason = input.failureReason ?? '';
    if (Buffer.byteLength(failureReason, 'utf8') > MAX_REASON_BYTES) {
      failureReason = failureReason.slice(0, MAX_REASON_BYTES);
    }
    const sanitized = sanitizeWithReport(failureReason);
    failureReason = sanitized.output;
    if (sanitized.redactedKinds.length > 0) {
      await this.rt.tasks.appendEvent(input.threadId, input.task.id, {
        kind: 'lastFailureReason_redacted',
        taskId: input.task.id,
        threadId: input.threadId,
        payload: {
          redactedKinds: sanitized.redactedKinds,
          originalLengthBytes: Buffer.byteLength(input.failureReason ?? '', 'utf8'),
          redactedLengthBytes: Buffer.byteLength(failureReason, 'utf8'),
        },
        at: new Date(this.now()).toISOString(),
      });
    }
    if (input.failureClass !== 'transient_error') {
      const r = input.task.retry ?? { attemptCount: 0, maxRetries: 2 };
      return {
        outcome: 'not_eligible',
        retry: { ...r, failureClass: input.failureClass, lastFailureReason: failureReason },
      };
    }
    const cur = input.task.retry ?? { attemptCount: 0, maxRetries: 2 };
    if (cur.attemptCount >= cur.maxRetries) {
      const exhausted: TaskRetryState = {
        ...cur,
        failureClass: input.failureClass,
        lastFailureAt: new Date(this.now()).toISOString(),
        lastFailureReason: failureReason,
      };
      const ev = await this.rt.tasks.appendEvent(
        input.threadId,
        input.task.id,
        {
          kind: 'task_retry_exhausted',
          taskId: input.task.id,
          threadId: input.threadId,
          payload: { attemptCount: exhausted.attemptCount, failureClass: input.failureClass },
          at: new Date(this.now()).toISOString(),
        },
      );
      void ev;
      // Acceptance 32: surface a task_blocked{retry_exhausted} with cancel as
      // the only suggested action — the scheduler will not retry again.
      const blockedEv = await this.rt.tasks.appendEvent(
        input.threadId,
        input.task.id,
        {
          kind: 'task_blocked',
          taskId: input.task.id,
          threadId: input.threadId,
          payload: {
            blockedReason: 'retry_exhausted',
            suggestedActions: ['cancel'],
          },
          at: new Date(this.now()).toISOString(),
        },
      );
      void blockedEv;
      return { outcome: 'exhausted', retry: exhausted };
    }
    const idx = Math.min(cur.attemptCount, BACKOFF_SCHEDULE_MS.length - 1);
    const baseMs = BACKOFF_SCHEDULE_MS[idx]!;
    const jitter = (this.jitterFn() - 0.5) * 0.4 * baseMs;
    const delayMs = Math.max(0, Math.floor(baseMs + jitter));
    const nextAt = new Date(this.now() + delayMs).toISOString();
    const next: TaskRetryState = {
      ...cur,
      attemptCount: cur.attemptCount + 1,
      failureClass: input.failureClass,
      lastFailureAt: new Date(this.now()).toISOString(),
      lastFailureReason: failureReason,
      nextRetryAt: nextAt,
    };
    // Acceptance 29: when this and the previous transient_error retries have
    // dissimilar reasons (jaccard < 0.5), surface a classification warning so
    // operators can investigate whether assertion_error is masquerading.
    if (
      cur.attemptCount >= 1 &&
      cur.failureClass === 'transient_error' &&
      typeof cur.lastFailureReason === 'string' &&
      cur.lastFailureReason.length > 0
    ) {
      const sim = jaccardSimilarity(cur.lastFailureReason, failureReason);
      if (sim < 0.5) {
        await this.rt.tasks.appendEvent(input.threadId, input.task.id, {
          kind: 'task_retry_classification_warning',
          taskId: input.task.id,
          threadId: input.threadId,
          payload: {
            attemptCount: next.attemptCount,
            similarity: sim,
            hint: 'consider_assertion_error',
          },
          at: new Date(this.now()).toISOString(),
        });
      }
    }
    const ev = await this.rt.tasks.appendEvent(input.threadId, input.task.id, {
      kind: 'task_retry_scheduled',
      taskId: input.task.id,
      threadId: input.threadId,
      payload: {
        attemptCount: next.attemptCount,
        nextRetryAt: nextAt,
        failureClass: input.failureClass,
      },
      at: new Date(this.now()).toISOString(),
    });
    void ev;
    // Acceptance 32: surface a task_blocked{retry_pending} so the UI can show
    // the cancel-only action set while the backoff timer counts down.
    const blockedEv = await this.rt.tasks.appendEvent(
      input.threadId,
      input.task.id,
      {
        kind: 'task_blocked',
        taskId: input.task.id,
        threadId: input.threadId,
        payload: {
          blockedReason: 'retry_pending',
          suggestedActions: ['cancel'],
          nextRetryAt: nextAt,
        },
        at: new Date(this.now()).toISOString(),
      },
    );
    void blockedEv;
    return { outcome: 'scheduled', nextRetryAt: nextAt, retry: next };
  }

  /**
   * Find tasks whose `nextRetryAt` is past and re-queue them via the
   * `autoRetry` path. Honors `lastUserSignal*`: if the most recent signal is
   * `cancel` after the last failure, emit `task_retry_skipped` and keep
   * `failed`. If the last signal is `pause`, also skip until resumed.
   */
  async tickForThread(threadId: string): Promise<Task[]> {
    const tasks = await this.rt.tasks.listForThread(threadId);
    const out: Task[] = [];
    for (const t of tasks) {
      if (t.status !== 'failed') continue;
      // Acceptance 36: skip tasks not yet migrated to schemaVersion=2. Missing
      // or unparseable values are treated as 1 (the migrator's next round will
      // upgrade them); never auto-retry until that happens.
      const sv =
        typeof t.schemaVersion === 'number' && Number.isFinite(t.schemaVersion)
          ? t.schemaVersion
          : 1;
      if (sv < 2) continue;
      const r = t.retry;
      if (!r?.nextRetryAt) continue;
      if (Date.parse(r.nextRetryAt) > this.now()) continue;
      if (
        t.lastUserSignalAt &&
        r.lastFailureAt &&
        Date.parse(t.lastUserSignalAt) > Date.parse(r.lastFailureAt)
      ) {
        if (t.lastUserSignalKind === 'cancel') {
          await this.rt.tasks.appendEvent(threadId, t.id, {
            kind: 'task_retry_exhausted',
            taskId: t.id,
            threadId,
            payload: { reason: 'user_cancel_supersedes' },
            at: new Date(this.now()).toISOString(),
          });
          continue;
        }
        if (t.lastUserSignalKind === 'pause') {
          await this.rt.tasks.appendEvent(threadId, t.id, {
            kind: 'task_retry_exhausted',
            taskId: t.id,
            threadId,
            payload: { reason: 'user_pause_active' },
            at: new Date(this.now()).toISOString(),
          });
          continue;
        }
      }
      try {
        const next = applyTaskTransition(t, 'queued', {
          autoRetry: true,
          now: new Date(this.now()).toISOString(),
        });
        await this.rt.tasks.update(next);
        await this.rt.tasks.appendEvent(threadId, next.id, {
          kind: 'task_retry_started',
          taskId: next.id,
          threadId,
          payload: { attemptCount: r.attemptCount },
          at: new Date(this.now()).toISOString(),
        });
        out.push(next);
      } catch {
        // ignore — could be transitioned by manual retry concurrently
      }
    }
    return out;
  }
}
