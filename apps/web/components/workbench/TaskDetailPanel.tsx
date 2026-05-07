'use client';
import * as React from 'react';
import type { TaskActionResponse } from '@ai-workflow/contracts';
import { api } from '../../lib/api-client';
import { cn } from '../../lib/cn';
import { useTasksStore } from '../../lib/stores/tasks';
import { ArtifactPanel } from './ArtifactPanel';
import { ChangeHistoryPanel } from './ChangeHistoryPanel';
import { LogViewer } from './LogViewer';
import { PlanProgressSection } from './PlanProgressSection';
import { TaskDetailTabs } from './TaskDetailTabs';

// TeamPanel lives in P0-B5 agent's file. Lazy-load with a graceful fallback so
// the drawer compiles even before that module lands.
const TeamPanelLazy = React.lazy(async () => {
  try {
    const mod = (await import('./TeamPanel')) as {
      WorkbenchTeamPanel?: React.ComponentType<{ taskId: string }>;
    };
    if (mod && typeof mod.WorkbenchTeamPanel === 'function') {
      return { default: mod.WorkbenchTeamPanel };
    }
    return {
      default: (_: { taskId: string }) => (
        <div className="p-4 text-sm text-muted">TeamPanel pending</div>
      ),
    };
  } catch {
    return {
      default: (_: { taskId: string }) => (
        <div className="p-4 text-sm text-muted">TeamPanel pending</div>
      ),
    };
  }
});

const STATUS_PILL: Record<string, string> = {
  draft: 'bg-muted/10 text-muted',
  confirmed: 'bg-accent-soft text-accent',
  queued: 'bg-warning/15 text-warning',
  running: 'bg-success/15 text-success',
  completed: 'bg-muted/10 text-muted',
  failed: 'bg-danger/15 text-danger',
  blocked: 'bg-danger/15 text-danger',
  cancelled: 'bg-muted/10 text-muted',
  paused: 'bg-warning/15 text-warning',
  awaiting_critical_node: 'bg-warning/15 text-warning',
};

function statusLabel(s: string | undefined): string {
  if (!s) return '未知';
  switch (s) {
    case 'draft':
      return '草稿';
    case 'confirmed':
      return '已确认';
    case 'queued':
      return '队列中';
    case 'running':
      return '运行中';
    case 'completed':
      return '已完成';
    case 'failed':
      return '失败';
    case 'blocked':
      return '阻塞';
    case 'cancelled':
      return '已取消';
    case 'paused':
      return '已暂停';
    case 'awaiting_critical_node':
      return '待审批';
    default:
      return s;
  }
}

function relativeTime(iso: string | undefined): string {
  if (!iso) return '';
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return '';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(diff / 86_400_000);
  return `${days} 天前`;
}

/**
 * Detail view for a single task. Loads task metadata on mount (and on window
 * focus), renders a header with title + status + TaskDetailTabs, and switches
 * the body on `detailTab` from the store.
 */
export function TaskDetailPanel(props: {
  taskId: string;
}): React.JSX.Element {
  const { taskId } = props;
  const detailTab = useTasksStore((s) => s.detailTab);
  const [data, setData] = React.useState<TaskActionResponse | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    let cancelled = false;
    api
      .getTask(taskId)
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch((e: unknown) => {
        if (!cancelled) setErr((e as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  React.useEffect(() => {
    setErr(null);
    setData(null);
    const cleanup = load();
    function onFocus(): void {
      load();
    }
    window.addEventListener('focus', onFocus);
    return () => {
      cleanup();
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  const task = data?.task;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-none border-b border-border px-4 py-3">
        <div className="flex items-start gap-2">
          <h2 className="min-w-0 flex-1 truncate text-base font-medium text-foreground">
            {task?.title ?? taskId}
          </h2>
          {task ? (
            <span
              className={cn(
                'flex-none rounded-pill px-2 py-0.5 text-xs',
                STATUS_PILL[task.status] ?? 'bg-muted/10 text-muted',
              )}
            >
              {statusLabel(task.status)}
            </span>
          ) : null}
        </div>
        <div className="mt-3">
          <TaskDetailTabs activeTab={detailTab} />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {err ? (
          <div className="p-4 text-sm text-danger">
            任务加载失败：{err}
          </div>
        ) : !task ? (
          <div className="p-4 text-sm text-muted">加载中…</div>
        ) : (
          <>
            {detailTab === 'summary' ? (
              <SummarySection taskId={taskId} task={task} />
            ) : null}
            {detailTab === 'plan' ? (
              <div className="p-4">
                <PlanProgressSection taskId={taskId} detailed />
              </div>
            ) : null}
            {detailTab === 'changes' ? (
              <ChangeHistoryPanel taskId={taskId} />
            ) : null}
            {detailTab === 'log' ? <LogViewer taskId={taskId} /> : null}
            {detailTab === 'team' ? (
              /* TeamPanel — provided by P0-B5 agent, import from './TeamPanel' */
              <React.Suspense
                fallback={
                  <div className="p-4 text-sm text-muted">TeamPanel 加载中…</div>
                }
              >
                <TeamPanelLazy taskId={taskId} />
              </React.Suspense>
            ) : null}
            {detailTab === 'artifact' ? (
              <ArtifactPanel taskId={taskId} />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function SummarySection(props: {
  taskId: string;
  task: TaskActionResponse['task'];
}): React.JSX.Element {
  const { task } = props;
  const budget = task.budget;
  const retry = task.retry;
  return (
    <div className="flex flex-col gap-3 p-4">
      <section className="rounded-card border border-border bg-surface p-4 shadow-soft">
        <div className="u-label mb-1">目标</div>
        <p className="text-sm text-foreground whitespace-pre-wrap">
          {task.description || task.title}
        </p>
      </section>

      <section className="grid grid-cols-2 gap-2 text-xs">
        <MetaCell label="负责人" value={task.ownerUserId} />
        <MetaCell
          label="最后信号"
          value={
            task.lastUserSignalAt
              ? `${task.lastUserSignalKind ?? ''} · ${relativeTime(task.lastUserSignalAt)}`
              : '—'
          }
        />
        <MetaCell
          label="预算"
          value={
            budget
              ? [
                  budget.maxDurationMs
                    ? `${Math.round(budget.maxDurationMs / 60000)} 分钟`
                    : null,
                  budget.maxTokens ? `${budget.maxTokens} tokens` : null,
                  budget.maxCostUsd !== undefined
                    ? `$${budget.maxCostUsd}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || '—'
              : '—'
          }
        />
        <MetaCell
          label="重试"
          value={
            retry
              ? `${retry.attemptCount}/${retry.maxRetries + 1}${
                  retry.failureClass ? ` · ${retry.failureClass}` : ''
                }`
              : '—'
          }
        />
      </section>

      {task.blockedReason ? (
        <section className="rounded-card border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          <div className="u-label mb-1 text-danger">阻塞原因</div>
          <p>{task.blockedReason}</p>
        </section>
      ) : null}

      <section className="rounded-card border border-border bg-surface p-3">
        <div className="u-label mb-1">任务操作</div>
        {/* TaskActions placeholder: wired in P0-C */}
        <p className="text-xs text-muted">
          操作按钮将在 P0-C 接入（现有 TaskActions 组件会挂载到此处）。
        </p>
      </section>
    </div>
  );
}

function MetaCell(props: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="rounded-card border border-border bg-surface px-3 py-2">
      <div className="u-label">{props.label}</div>
      <div className="mt-0.5 truncate text-sm text-foreground">{props.value}</div>
    </div>
  );
}

export default TaskDetailPanel;
