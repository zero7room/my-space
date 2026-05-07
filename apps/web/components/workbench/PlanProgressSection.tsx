'use client';
import * as React from 'react';
import type { PlanListResponse } from '@ai-workflow/contracts';
import { api } from '../../lib/api-client';
import { cn } from '../../lib/cn';

type StepStatus =
  | 'pending'
  | 'running'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'skipped';

const STEP_RING: Record<string, string> = {
  pending: 'border-muted/60 bg-transparent',
  running: 'border-accent bg-accent',
  in_progress: 'border-accent bg-accent',
  completed: 'border-success bg-success',
  failed: 'border-danger bg-danger',
  blocked: 'border-warning bg-warning',
  skipped: 'border-muted/40 bg-transparent',
};

const PLAN_STATUS_PILL: Record<string, string> = {
  active: 'bg-accent-soft text-accent',
  revising: 'bg-warning/15 text-warning',
  superseded: 'bg-muted/10 text-muted',
  completed: 'bg-success/15 text-success',
  draft: 'bg-muted/10 text-muted',
};

function statusLabel(s: string): string {
  switch (s) {
    case 'active':
      return '进行中';
    case 'revising':
      return '修订中';
    case 'superseded':
      return '已替换';
    case 'completed':
      return '已完成';
    case 'draft':
      return '草稿';
    default:
      return s;
  }
}

function stepStatusLabel(s: string): string {
  switch (s) {
    case 'pending':
      return '待开始';
    case 'running':
    case 'in_progress':
      return '进行中';
    case 'completed':
      return '完成';
    case 'failed':
      return '失败';
    case 'blocked':
      return '阻塞';
    case 'skipped':
      return '跳过';
    default:
      return s;
  }
}

/**
 * Fetches the active plan for the task and renders a summary (counts + header)
 * and — when `detailed` is set — the full step list with colored status dots.
 *
 * The `detailed` flag is used by TaskDetailPanel#plan tab to render the long
 * form; TaskListPanel uses the compact form above the list.
 */
export function PlanProgressSection(props: {
  taskId: string;
  detailed?: boolean;
}): React.JSX.Element {
  const { taskId, detailed = false } = props;
  const [data, setData] = React.useState<PlanListResponse | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setErr(null);
    setData(null);
    api
      .taskPlans(taskId)
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

  if (err) {
    return (
      <section className="rounded-card border border-border bg-surface px-4 py-3 text-sm text-muted">
        计划加载失败：{err}
      </section>
    );
  }
  if (!data) {
    return (
      <section className="rounded-card border border-border bg-surface px-4 py-3 text-sm text-muted">
        计划加载中…
      </section>
    );
  }
  const plan = data.plan;
  if (!plan) {
    return (
      <section className="rounded-card border border-border bg-surface px-4 py-3 text-sm text-muted">
        暂无计划
      </section>
    );
  }

  const total = plan.steps.length;
  const counts = {
    completed: 0,
    failed: 0,
    blocked: 0,
    running: 0,
  };
  for (const s of plan.steps) {
    const st = s.status as StepStatus;
    if (st === 'completed') counts.completed += 1;
    else if (st === 'failed') counts.failed += 1;
    else if (st === 'blocked') counts.blocked += 1;
    else if (st === 'running' || st === 'in_progress') counts.running += 1;
  }

  return (
    <section className="rounded-card border border-border bg-surface px-4 py-3 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="u-label">当前计划</div>
          <p className="mt-1 truncate text-sm text-foreground">
            {plan.objective || '（无目标描述）'}
          </p>
        </div>
        <span
          className={cn(
            'flex-none rounded-pill px-2 py-0.5 text-xs',
            PLAN_STATUS_PILL[plan.status] ?? 'bg-muted/10 text-muted',
          )}
        >
          {statusLabel(plan.status)}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span>
          {counts.completed}/{total} 已完成
        </span>
        {counts.running > 0 ? <span>{counts.running} 进行中</span> : null}
        <span>{counts.failed} 失败</span>
        <span>{counts.blocked} 阻塞</span>
      </div>

      {detailed ? (
        <ol className="mt-3 space-y-2">
          {plan.steps.map((s, idx) => (
            <li key={s.id} className="flex items-start gap-2 text-sm">
              <span
                aria-hidden
                className={cn(
                  'mt-1 inline-block h-2.5 w-2.5 flex-none rounded-full border',
                  STEP_RING[s.status] ?? STEP_RING.pending,
                )}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs text-muted">#{idx + 1}</span>
                  <span className="flex-1 truncate text-foreground">
                    {s.title}
                  </span>
                  <span className="text-xs text-muted">
                    {stepStatusLabel(s.status)}
                  </span>
                </div>
                {s.description ? (
                  <p className="mt-0.5 text-xs text-muted">{s.description}</p>
                ) : null}
              </div>
            </li>
          ))}
          {plan.steps.length === 0 ? (
            <li className="text-xs text-muted">（计划暂无步骤）</li>
          ) : null}
        </ol>
      ) : null}
    </section>
  );
}

export default PlanProgressSection;
