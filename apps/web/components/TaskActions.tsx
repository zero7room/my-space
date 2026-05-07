'use client';
import * as React from 'react';
import { api } from '../lib/api-client';
import {
  blockedReasonDescription,
  blockedReasonTitle,
} from '../lib/blocked-reason-copy';
import { useTasksStore } from '../lib/stores/tasks';
import { showError, showSuccess } from './workbench/ToastProvider';
import { cn } from '../lib/cn';

type Props = {
  taskId: string;
  status: string;
  blockedReason?: string;
};

type ActionKind = 'confirm' | 'cancel' | 'pause' | 'resume' | 'retry' | 'skip';

export function TaskActions({ taskId, status, blockedReason }: Props): React.JSX.Element {
  const [busy, setBusy] = React.useState<ActionKind | null>(null);
  const blocked = useTasksStore((s) => s.blocked[taskId]);

  // Derive allowed actions.
  // - If task_blocked event carries suggestedActions (authoritative per acceptance 32/2185), use it for retry/skip/cancel states.
  // - Otherwise fall back to status-based rules from the legacy matrix.
  const suggested = blocked?.suggestedActions;

  const canConfirm = status === 'draft';
  const canPause = ['queued', 'running', 'awaiting_critical_node', 'blocked'].includes(status);
  const canResume = status === 'paused';
  const terminal = ['completed', 'cancelled'].includes(status);

  // For blocked / failed with retry reasons: use suggestedActions if present
  const isBlockedOrFailed = status === 'blocked' || status === 'failed';
  const suggestedSet = new Set(suggested ?? []);
  const hasSuggested = suggested !== undefined;

  const canRetry =
    isBlockedOrFailed &&
    (hasSuggested
      ? suggestedSet.has('retry')
      : status === 'failed' &&
        ['retry_pending', 'retry_exhausted', 'awaiting_user_action', 'non_idempotent_tool_in_flight'].includes(
          blockedReason ?? '',
        ));

  const canSkip =
    isBlockedOrFailed &&
    (hasSuggested
      ? suggestedSet.has('skip')
      : status === 'blocked' &&
        ['awaiting_user_action', 'non_idempotent_tool_in_flight'].includes(blockedReason ?? ''));

  // Cancel is typically always enabled except in terminal states.
  // When suggestedActions is provided for a blocked/failed task, respect it strictly.
  const canCancel = terminal
    ? false
    : hasSuggested && isBlockedOrFailed
      ? suggestedSet.has('cancel')
      : !terminal;

  async function run(kind: ActionKind, fn: () => Promise<unknown>): Promise<void> {
    setBusy(kind);
    try {
      await fn();
      showSuccess(`已执行：${kind}`);
    } catch (err) {
      showError(err);
    } finally {
      setBusy(null);
    }
  }

  const base =
    'rounded-pill px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40';
  const primary = `${base} bg-accent text-white shadow-soft hover:-translate-y-px`;
  const ghost = `${base} border border-border bg-surface text-foreground hover:-translate-y-px`;
  const danger = `${base} border border-danger/40 bg-surface text-danger hover:bg-danger/10`;

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
      {canConfirm && (
        <button type="button" disabled={busy !== null} className={primary}
          onClick={() => run('confirm', () => api.confirmTask(taskId))}>
          确认任务
        </button>
      )}
      {canRetry && (
        <button type="button" disabled={busy !== null} className={primary}
          onClick={() => run('retry', () => api.retryTask(taskId))}>
          重试
        </button>
      )}
      {canSkip && (
        <button type="button" disabled={busy !== null} className={ghost}
          onClick={() => run('skip', () => api.skipTask(taskId))}>
          跳过
        </button>
      )}
      {canPause && !hasSuggested && (
        <button type="button" disabled={busy !== null} className={ghost}
          onClick={() => run('pause', () => api.pauseTask(taskId))}>
          暂停
        </button>
      )}
      {canResume && (
        <button type="button" disabled={busy !== null} className={ghost}
          onClick={() => run('resume', () => api.resumeTask(taskId))}>
          继续
        </button>
      )}
      {canCancel && (
        <button type="button" disabled={busy !== null} className={danger}
          onClick={() => run('cancel', () => api.cancelTask(taskId))}>
          取消
        </button>
      )}
      {blocked && blocked.blockedReason ? (
        <span className={cn('u-label', 'ml-2')}>
          阻塞原因：<span className="not-italic text-danger/90">{blockedReasonTitle(blocked.blockedReason)}</span>
        </span>
      ) : blockedReason ? (
        <span className="u-label ml-2">
          阻塞原因：<span className="text-danger/90">{blockedReasonTitle(blockedReason)}</span>
        </span>
      ) : null}
      </div>
      {(() => {
        const reason = blocked?.blockedReason ?? blockedReason;
        const desc = blockedReasonDescription(reason);
        return desc ? (
          <p className="text-xs text-muted">{desc}</p>
        ) : null;
      })()}
    </div>
  );
}
