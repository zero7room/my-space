/**
 * Executor: drives a single task through its plan. v1 contract:
 *
 *   loop:
 *     1. read task + plan + recent events
 *     2. ask ModelAdapter for a tool proposal (or finish/ask)
 *     3. evaluate CriticalNodePolicy on the proposal
 *        - block        → emit `tool_call_blocked_by_critical_node`, fail task
 *        - require_approval → emit blocked event, transition task to
 *          awaiting_critical_node, return (resume on `tool_call_approved`)
 *        - log_only     → emit then dispatch
 *     4. invoke ToolRegistry.invoke
 *        - on `ask_clarification`: transition task to blocked, set
 *          blockedReason='awaiting_user_action'
 *        - on Error → classify (transient/permanent/permission), emit
 *          tool_call_failed, transition to failed
 *     5. emit tool_call_started/completed, persist updated task, recurse
 *
 * Phase 7 hardens retry classification + scheduler. v1 stays deterministic.
 */
import {
  type Task,
  applyTaskTransition,
} from '@ai-workflow/contracts';

import type { RuntimePaths } from '../runtime/paths.js';
import type { SseRegistry } from '../runtime/sse/index.js';
import type { ToolRegistry } from '../tools/index.js';
import type { CriticalNodePolicyEngine } from '../critical-node/index.js';
import type { SkillRegistry } from '../skills/index.js';

import type { ModelAdapter, ToolProposal } from './model-adapter.js';

export interface ExecutorDeps {
  rt: RuntimePaths;
  tools: ToolRegistry;
  policies: CriticalNodePolicyEngine;
  skills?: SkillRegistry;
  sse?: SseRegistry;
  now?: () => string;
}

export interface RunOptions {
  threadId: string;
  taskId: string;
  adapter: ModelAdapter;
  /** Cap on tool calls per run; prevents runaway loops in tests. */
  maxSteps?: number;
}

export interface RunOutcome {
  finalStatus: Task['status'];
  steps: number;
}

export class Executor {
  constructor(private readonly deps: ExecutorDeps) {}

  private get now(): string {
    return (this.deps.now ?? (() => new Date().toISOString()))();
  }

  async runTask(opts: RunOptions): Promise<RunOutcome> {
    const limit = opts.maxSteps ?? 32;
    let task = await this.deps.rt.tasks.get(opts.threadId, opts.taskId);
    if (!task) throw new Error(`task ${opts.taskId} not found`);

    // Transition queued → running on entry.
    if (task.status === 'queued') {
      task = applyTaskTransition(task, 'running', { now: this.now });
      await this.deps.rt.tasks.update(task);
      const ev = await this.deps.rt.tasks.appendEvent(opts.threadId, task.id, {
        kind: 'task_started',
        taskId: task.id,
        threadId: opts.threadId,
        payload: {},
        at: this.now,
      });
      if (this.deps.sse) this.deps.sse.publish(ev);
    } else if (task.status !== 'running') {
      return { finalStatus: task.status, steps: 0 };
    }

    let steps = 0;
    while (steps < limit) {
      // Poll control.json before every dispatch so cancel/pause preempt the
      // loop between tool calls (per Phase 6 review F2).
      const ctl = await this.deps.rt.tasks.readControl(opts.threadId, opts.taskId);
      if (ctl) {
        const cancel = ctl.pendingSignals.find((s) => s.kind === 'cancel');
        const pause = ctl.pendingSignals.find((s) => s.kind === 'pause');
        if (cancel) {
          task = applyTaskTransition(task, 'cancelled', { now: this.now });
          await this.deps.rt.tasks.update(task);
          const ev = await this.deps.rt.tasks.appendEvent(opts.threadId, task.id, {
            kind: 'task_cancelled',
            taskId: task.id,
            threadId: opts.threadId,
            payload: { actorUserId: cancel.userId, source: 'executor' },
            at: this.now,
          });
          if (this.deps.sse) this.deps.sse.publish(ev);
          return { finalStatus: 'cancelled', steps };
        }
        if (pause) {
          task = applyTaskTransition(task, 'paused', { now: this.now });
          await this.deps.rt.tasks.update(task);
          const ev = await this.deps.rt.tasks.appendEvent(opts.threadId, task.id, {
            kind: 'task_paused',
            taskId: task.id,
            threadId: opts.threadId,
            payload: { actorUserId: pause.userId, source: 'executor' },
            at: this.now,
          });
          if (this.deps.sse) this.deps.sse.publish(ev);
          return { finalStatus: 'paused', steps };
        }
      }

      // CriticalNodePolicy may have been hot-reloaded; we re-evaluate per call.
      const proposed = await opts.adapter.proposeTool({
        taskTitle: task.title,
        taskDescription: task.description,
        planObjective: '',
        recentEvents: [],
      });
      if ('kind' in proposed && proposed.kind === 'finish') {
        task = applyTaskTransition(task, 'completed', { now: this.now });
        await this.deps.rt.tasks.update(task);
        const ev = await this.deps.rt.tasks.appendEvent(opts.threadId, task.id, {
          kind: 'task_completed',
          taskId: task.id,
          threadId: opts.threadId,
          payload: {},
          at: this.now,
        });
        if (this.deps.sse) this.deps.sse.publish(ev);
        const { markThreadChattingIfDone } = await import(
          '../thread-loop/thread-state.js'
        );
        await markThreadChattingIfDone(
          this.deps.rt,
          opts.threadId,
          task,
          this.deps.sse,
          () => this.now,
        );
        return { finalStatus: 'completed', steps };
      }
      if ('kind' in proposed && proposed.kind === 'ask') {
        task = applyTaskTransition(task, 'blocked', {
          blockedReason: 'awaiting_user_action',
          now: this.now,
        });
        await this.deps.rt.tasks.update(task);
        const ev = await this.deps.rt.tasks.appendEvent(opts.threadId, task.id, {
          kind: 'task_blocked',
          taskId: task.id,
          threadId: opts.threadId,
          payload: {
            question: proposed.question,
            blockedReason: 'awaiting_user_action',
            suggestedActions: ['retry', 'skip', 'cancel'],
          },
          at: this.now,
        });
        if (this.deps.sse) this.deps.sse.publish(ev);
        return { finalStatus: 'blocked', steps };
      }

      const result = await this.dispatchTool(task, opts.threadId, proposed);
      steps++;
      if (result.outcome === 'failed') {
        task = applyTaskTransition(task, 'failed', {
          blockedReason: 'retry_pending',
          now: this.now,
        });
        await this.deps.rt.tasks.update(task);
        return { finalStatus: 'failed', steps };
      }
      if (result.outcome === 'blocked_policy') {
        task = applyTaskTransition(task, 'awaiting_critical_node', {
          now: this.now,
        });
        await this.deps.rt.tasks.update(task);
        return { finalStatus: 'awaiting_critical_node', steps };
      }
      if (result.outcome === 'awaiting_user_action') {
        task = applyTaskTransition(task, 'blocked', {
          blockedReason: 'awaiting_user_action',
          now: this.now,
        });
        await this.deps.rt.tasks.update(task);
        const ev = await this.deps.rt.tasks.appendEvent(opts.threadId, task.id, {
          kind: 'task_blocked',
          taskId: task.id,
          threadId: opts.threadId,
          payload: {
            blockedReason: 'awaiting_user_action',
            suggestedActions: ['retry', 'skip', 'cancel'],
          },
          at: this.now,
        });
        if (this.deps.sse) this.deps.sse.publish(ev);
        return { finalStatus: 'blocked', steps };
      }
    }

    // Step limit reached — return current state without transitioning.
    return { finalStatus: task.status, steps };
  }

  private async dispatchTool(
    task: Task,
    threadId: string,
    p: ToolProposal,
  ): Promise<{
    outcome: 'ok' | 'failed' | 'blocked_policy' | 'awaiting_user_action';
  }> {
    const decision = this.deps.policies.evaluate(
      {
        toolName: p.toolName,
        toolArgs: p.toolArgs,
        skillName: p.skillName,
      },
      this.deps.skills,
    );
    if (decision.action === 'block') {
      const ev = await this.deps.rt.tasks.appendEvent(threadId, task.id, {
        kind: 'tool_call_blocked_by_critical_node',
        taskId: task.id,
        threadId,
        payload: {
          toolName: p.toolName,
          decisionReason: decision.reason,
          action: 'block',
        },
        at: this.now,
      });
      if (this.deps.sse) this.deps.sse.publish(ev);
      return { outcome: 'failed' };
    }
    if (decision.action === 'require_approval') {
      const ev = await this.deps.rt.tasks.appendEvent(threadId, task.id, {
        kind: 'tool_call_blocked_by_critical_node',
        taskId: task.id,
        threadId,
        payload: {
          toolName: p.toolName,
          decisionReason: decision.reason,
          action: 'require_approval',
        },
        at: this.now,
      });
      if (this.deps.sse) this.deps.sse.publish(ev);
      return { outcome: 'blocked_policy' };
    }
    // log_only → emit policy event, dispatch.
    if (decision.matched.length > 0) {
      await this.deps.rt.tasks.appendEvent(threadId, task.id, {
        kind: 'critical_policy_changed',
        taskId: task.id,
        threadId,
        payload: { toolName: p.toolName, action: 'log_only' },
        at: this.now,
      });
    }

    const evStart = await this.deps.rt.tasks.appendEvent(threadId, task.id, {
      kind: 'tool_call_started',
      taskId: task.id,
      threadId,
      payload: { toolName: p.toolName },
      at: this.now,
    });
    if (this.deps.sse) this.deps.sse.publish(evStart);

    try {
      const out = await this.deps.tools.invoke(p.toolName, {
        rt: this.deps.rt,
        task,
        threadId,
      }, p.toolArgs);
      const evDone = await this.deps.rt.tasks.appendEvent(threadId, task.id, {
        kind: 'tool_call_completed',
        taskId: task.id,
        threadId,
        payload: { toolName: p.toolName, output: out as unknown },
        at: this.now,
      });
      if (this.deps.sse) this.deps.sse.publish(evDone);
      if (p.toolName === 'ask_clarification') return { outcome: 'awaiting_user_action' };
      return { outcome: 'ok' };
    } catch (err) {
      const reason = (err as Error).message;
      const failureClass = classifyToolError(reason);
      const evFail = await this.deps.rt.tasks.appendEvent(threadId, task.id, {
        kind: 'tool_call_failed',
        taskId: task.id,
        threadId,
        payload: {
          toolName: p.toolName,
          reason,
          failureClass,
        },
        at: this.now,
      });
      if (this.deps.sse) this.deps.sse.publish(evFail);
      return { outcome: 'failed' };
    }
  }
}

export function classifyToolError(message: string): string {
  if (message.startsWith('permission_error:')) return 'permission_error';
  if (/timeout|ENETUNREACH|EAI_AGAIN|503|504|connection reset/i.test(message)) {
    return 'transient_error';
  }
  if (/permission|forbidden|access denied/i.test(message)) {
    return 'permission_error';
  }
  return 'assertion_error';
}
