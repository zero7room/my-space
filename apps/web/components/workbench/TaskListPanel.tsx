'use client';
import * as React from 'react';
import type { ThreadDto, ThreadListResponse } from '@ai-workflow/contracts';
import { api } from '../../lib/api-client';
import { cn } from '../../lib/cn';
import { useTasksStore } from '../../lib/stores/tasks';
import { PlanProgressSection } from './PlanProgressSection';

type TaskRef = {
  taskId: string;
  status?: string;
  title?: string;
  updatedAt?: string;
};

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

const TERMINAL_STATUSES = new Set([
  'completed',
  'failed',
  'cancelled',
]);

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
  const days = Math.floor(diff / 86_400_000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `更新于 ${mins} 分钟前`;
  if (hours < 24) return `更新于 ${hours} 小时前`;
  return `更新于 ${days} 天前`;
}

function shortId(id: string): string {
  const tail = id.includes('_') ? id.split('_').pop() : id;
  if (!tail) return id;
  return tail.length > 8 ? tail.slice(0, 8) : tail;
}

// Defensive extractor — the backend may expose task refs under several shapes.
function extractTaskRefs(thread: unknown): TaskRef[] {
  if (thread === null || typeof thread !== 'object') return [];
  const t = thread as Record<string, unknown>;
  const raw =
    (t['taskList'] as unknown) ??
    (t['tasks'] as unknown) ??
    (t['taskRefs'] as unknown);
  if (!Array.isArray(raw)) {
    // Fallback: if the thread exposes `activeTaskId` only, synthesize a single ref.
    const activeTaskId = t['activeTaskId'];
    if (typeof activeTaskId === 'string' && activeTaskId.length > 0) {
      return [{ taskId: activeTaskId }];
    }
    return [];
  }
  const refs: TaskRef[] = [];
  for (const entry of raw) {
    if (typeof entry === 'string') {
      refs.push({ taskId: entry });
    } else if (entry && typeof entry === 'object') {
      const e = entry as Record<string, unknown>;
      const id = (e['taskId'] ?? e['id']) as string | undefined;
      if (!id) continue;
      refs.push({
        taskId: id,
        status:
          typeof e['status'] === 'string' ? (e['status'] as string) : undefined,
        title:
          typeof e['title'] === 'string' ? (e['title'] as string) : undefined,
        updatedAt:
          typeof e['updatedAt'] === 'string'
            ? (e['updatedAt'] as string)
            : undefined,
      });
    }
  }
  return refs;
}

function findThread(
  threads: ThreadDto[],
  threadId: string | null,
): ThreadDto | undefined {
  if (!threadId) return undefined;
  return threads.find((t) => t.id === threadId);
}

/**
 * Lists the tasks attached to the current thread. Polls `api.listThreads()`
 * every 3s as a transport-agnostic MVP. Clicking a task row opens it in the
 * detail view. Above the list, if there is an active task with a plan, show a
 * compact PlanProgressSection summary.
 */
export function TaskListPanel(props: {
  threadId: string | null;
}): React.JSX.Element {
  const { threadId } = props;
  const setSelected = useTasksStore((s) => s.setSelected);
  const [refs, setRefs] = React.useState<TaskRef[]>([]);
  const [activeTaskId, setActiveTaskId] = React.useState<string | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [showTerminal, setShowTerminal] = React.useState(false);

  React.useEffect(() => {
    if (!threadId) {
      setRefs([]);
      setActiveTaskId(null);
      setLoaded(true);
      return;
    }
    let cancelled = false;
    async function pull(): Promise<void> {
      try {
        const r: ThreadListResponse = await api.listThreads();
        if (cancelled) return;
        const th = findThread(r.threads, threadId);
        if (!th) {
          setRefs([]);
          setActiveTaskId(null);
        } else {
          setRefs(extractTaskRefs(th));
          const active = (th as unknown as Record<string, unknown>)[
            'activeTaskId'
          ];
          setActiveTaskId(typeof active === 'string' ? active : null);
        }
      } catch {
        /* swallow — degraded banner handles transport issues */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }
    void pull();
    const iv = setInterval(() => {
      void pull();
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [threadId]);

  const { active, terminal } = React.useMemo(() => {
    const a: TaskRef[] = [];
    const t: TaskRef[] = [];
    for (const r of refs) {
      if (r.status && TERMINAL_STATUSES.has(r.status)) t.push(r);
      else a.push(r);
    }
    return { active: a, terminal: t };
  }, [refs]);

  const collapseTerminal = terminal.length > 3 && !showTerminal;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4">
      {activeTaskId ? <PlanProgressSection taskId={activeTaskId} /> : null}

      <div className="u-label">任务列表</div>

      {!loaded ? (
        <div className="rounded-card border border-border bg-surface p-4 text-sm text-muted">
          加载中…
        </div>
      ) : refs.length === 0 ? (
        <div className="rounded-card border border-border bg-surface p-4 text-sm text-muted">
          当前对话暂无任务。发送新的需求即可创建任务草稿。
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {active.map((r) => (
              <TaskRow
                key={r.taskId}
                taskRef={r}
                onSelect={() => setSelected(r.taskId)}
              />
            ))}
          </ul>

          {terminal.length > 0 ? (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setShowTerminal((v) => !v)}
                className="u-label cursor-pointer hover:text-accent"
              >
                {collapseTerminal
                  ? `已结束 (${terminal.length}) ▸`
                  : `已结束 (${terminal.length}) ▾`}
              </button>
              {!collapseTerminal ? (
                <ul className="mt-2 flex flex-col gap-2 opacity-80">
                  {terminal.map((r) => (
                    <TaskRow
                      key={r.taskId}
                      taskRef={r}
                      onSelect={() => setSelected(r.taskId)}
                    />
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function TaskRow(props: {
  taskRef: TaskRef;
  onSelect: () => void;
}): React.JSX.Element {
  const { taskRef, onSelect } = props;
  const title = taskRef.title ?? shortId(taskRef.taskId);
  const pillClass =
    STATUS_PILL[taskRef.status ?? ''] ?? 'bg-muted/10 text-muted';
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          'flex w-full flex-col items-start gap-1 rounded-card border border-border bg-surface px-4 py-3 text-left transition hover:-translate-y-px hover:border-accent',
        )}
      >
        <div className="flex w-full items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
            {title}
          </span>
          <span className={cn('flex-none rounded-pill px-2 py-0.5 text-xs', pillClass)}>
            {statusLabel(taskRef.status)}
          </span>
        </div>
        <span className="text-xs text-muted">
          {relativeTime(taskRef.updatedAt) || shortId(taskRef.taskId)}
        </span>
      </button>
    </li>
  );
}

export default TaskListPanel;
