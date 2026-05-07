/**
 * ThreadLoop drains pendingSignals from `control.json` and applies effects:
 *   - cancel/pause/resume → task state transition + event
 *   - manual_retry → resets retry attemptCount and transitions failed → queued
 *   - skip → marks the active plan step as skipped (Phase 6 wires deeper)
 *   - revise (with planRevisionId) → triggers PlanRevisionService
 *   - critical_node_decision → forwards to Executor (consumed by Phase 6)
 *
 * The loop is *pull* style: callers (API actions, tests, periodic worker)
 * invoke `runOnce(threadId, taskId)` to drain. This keeps wiring simple and
 * avoids a background timer in tests.
 */
import {
  applyTaskTransition,
  type Task,
  type TaskControl,
  newEventId,
} from '@ai-workflow/contracts';

import type { RuntimePaths } from '../runtime/paths.js';
import type { SseRegistry } from '../runtime/sse/index.js';

interface ThreadLoopDeps {
  rt: RuntimePaths;
  sse?: SseRegistry;
  now?: () => string;
}

export class ThreadLoop {
  constructor(private readonly deps: ThreadLoopDeps) {}

  private get now(): string {
    return (this.deps.now ?? (() => new Date().toISOString()))();
  }

  /**
   * Drain pendingSignals for a (thread, task) pair. Returns the events
   * emitted, in order.
   */
  async runOnce(threadId: string, taskId: string): Promise<unknown[]> {
    const ctl = await this.deps.rt.tasks.readControl(threadId, taskId);
    if (!ctl || ctl.pendingSignals.length === 0) return [];
    const task = await this.deps.rt.tasks.get(threadId, taskId);
    if (!task) return [];

    let current: Task = task;
    const emitted: unknown[] = [];

    for (const sig of ctl.pendingSignals) {
      try {
        const res = await this.applySignal(threadId, current, sig);
        if (res) {
          current = res.task;
          emitted.push(res.event);
        }
      } catch (err) {
        // Schema/transition rejected — emit a `task_state_transition_blocked`.
        const ev = await this.deps.rt.tasks.appendEvent(threadId, current.id, {
          kind: 'task_state_transition_blocked',
          taskId: current.id,
          threadId,
          payload: {
            attempted: sig.kind,
            reason: (err as Error).message,
          },
          at: this.now,
        });
        emitted.push(ev);
        if (this.deps.sse) this.deps.sse.publish(ev);
      }
    }

    // Drain: write empty pending list.
    const drained: TaskControl = {
      taskId,
      pendingSignals: [],
      updatedAt: this.now,
    };
    await this.deps.rt.tasks.writeControl(threadId, taskId, drained);
    return emitted;
  }

  private async applySignal(
    threadId: string,
    task: Task,
    sig: TaskControl['pendingSignals'][number],
  ): Promise<{ task: Task; event: unknown } | undefined> {
    const now = this.now;
    if (sig.kind === 'cancel') {
      if (task.status === 'completed' || task.status === 'cancelled') {
        return undefined;
      }
      const next = applyTaskTransition(task, 'cancelled', { now });
      next.lastUserSignalAt = now;
      next.lastUserSignalKind = 'cancel';
      await this.deps.rt.tasks.update(next);
      const ev = await this.deps.rt.tasks.appendEvent(threadId, next.id, {
        kind: 'task_cancelled',
        taskId: next.id,
        threadId,
        payload: { actorUserId: sig.userId },
        at: now,
      });
      if (this.deps.sse) this.deps.sse.publish(ev);
      return { task: next, event: ev };
    }
    if (sig.kind === 'pause') {
      if (
        task.status === 'queued' ||
        task.status === 'running' ||
        task.status === 'awaiting_critical_node'
      ) {
        const next = applyTaskTransition(task, 'paused', { now });
        next.lastUserSignalAt = now;
        next.lastUserSignalKind = 'pause';
        await this.deps.rt.tasks.update(next);
        const ev = await this.deps.rt.tasks.appendEvent(threadId, next.id, {
          kind: 'task_paused',
          taskId: next.id,
          threadId,
          payload: { actorUserId: sig.userId },
          at: now,
        });
        if (this.deps.sse) this.deps.sse.publish(ev);
        return { task: next, event: ev };
      }
      return undefined;
    }
    if (sig.kind === 'resume') {
      if (task.status === 'paused') {
        const next = applyTaskTransition(task, 'queued', { now });
        next.lastUserSignalAt = now;
        next.lastUserSignalKind = 'resume';
        await this.deps.rt.tasks.update(next);
        const ev = await this.deps.rt.tasks.appendEvent(threadId, next.id, {
          kind: 'task_resumed',
          taskId: next.id,
          threadId,
          payload: { actorUserId: sig.userId },
          at: now,
        });
        if (this.deps.sse) this.deps.sse.publish(ev);
        return { task: next, event: ev };
      }
      return undefined;
    }
    if (sig.kind === 'manual_retry') {
      if (task.status !== 'failed') return undefined;
      // Reset retry counters and transition failed→queued via manualRetry path.
      const reset = {
        ...task,
        retry: { attemptCount: 0, maxRetries: task.retry?.maxRetries ?? 2 },
      };
      const next = applyTaskTransition(reset, 'queued', {
        manualRetry: true,
        now,
      });
      next.lastUserSignalAt = now;
      await this.deps.rt.tasks.update(next);
      const ev = await this.deps.rt.tasks.appendEvent(threadId, next.id, {
        kind: 'task_manual_retry_requested',
        taskId: next.id,
        threadId,
        payload: { actorUserId: sig.userId },
        at: now,
      });
      if (this.deps.sse) this.deps.sse.publish(ev);
      return { task: next, event: ev };
    }
    if (sig.kind === 'skip') {
      // Phase 6 deepens: marks current plan step skipped. v1: append event.
      const ev = await this.deps.rt.tasks.appendEvent(threadId, task.id, {
        kind: 'plan_step_skipped',
        taskId: task.id,
        threadId,
        payload: {
          actorUserId: sig.userId,
          stepHint: sig.payload?.['stepId'],
        },
        at: now,
      });
      if (this.deps.sse) this.deps.sse.publish(ev);
      return { task, event: ev };
    }
    if (sig.kind === 'critical_node_decision') {
      const decision = sig.payload?.['decision'];
      const ev = await this.deps.rt.tasks.appendEvent(threadId, task.id, {
        kind: 'tool_call_approved',
        taskId: task.id,
        threadId,
        payload: { actorUserId: sig.userId, decision },
        at: now,
      });
      if (this.deps.sse) this.deps.sse.publish(ev);
      return { task, event: ev };
    }
    if (sig.kind === 'revise') {
      // Phase 5 step 4: full plan-update transaction. v1 minimal:
      // - append `plan_revising` event; defer artifact archive to PlanRevisionService.
      const ev = await this.deps.rt.tasks.appendEvent(threadId, task.id, {
        kind: 'plan_revising',
        taskId: task.id,
        threadId,
        payload: {
          actorUserId: sig.userId,
          planRevisionId: sig.payload?.['planRevisionId'],
        },
        at: now,
      });
      if (this.deps.sse) this.deps.sse.publish(ev);
      return { task, event: ev };
    }
    // unknown signal — ignore
    void newEventId;
    return undefined;
  }
}
