'use client';
import * as React from 'react';
import type { RetryHistoryResponse } from '@ai-workflow/contracts';
import { api } from '../../lib/api-client';
import { cn } from '../../lib/cn';

const FAILURE_PILL: Record<string, string> = {
  retryable: 'bg-warning/15 text-warning',
  permanent: 'bg-danger/15 text-danger',
  unknown: 'bg-muted/10 text-muted',
};

function relativeTime(iso: string | undefined): string {
  if (!iso) return '';
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return '';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  return `${days} 天前`;
}

/**
 * Tabular view of a task's retry history. Acceptance 69 / design §16.4.
 * Shows attempt count, failure class, summary, and timestamp per entry.
 */
export function RetryHistoryView(props: { taskId: string }): React.JSX.Element {
  const { taskId } = props;
  const [data, setData] = React.useState<RetryHistoryResponse | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setErr(null);
    setData(null);
    api
      .retryHistory(taskId)
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
      <section className="p-4 text-sm text-muted">
        重试历史加载失败：{err}
      </section>
    );
  }
  if (!data) {
    return <section className="p-4 text-sm text-muted">加载中…</section>;
  }
  if (data.entries.length === 0) {
    return (
      <section className="p-4 text-sm text-muted">
        当前任务暂无重试记录。
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3 p-4">
      <div className="u-label">重试历史</div>
      <ul className="flex flex-col gap-2">
        {data.entries.map((e) => {
          const cls = e.failureClass ?? 'unknown';
          return (
            <li
              key={e.eventId}
              className="rounded-card border border-border bg-surface p-3 shadow-soft"
            >
              <div className="flex items-center gap-2 text-xs">
                <span className="font-medium text-foreground">
                  尝试 #{e.attemptCount}
                </span>
                <span className="text-muted">·</span>
                <span className="text-muted">{relativeTime(e.at)}</span>
                <span
                  className={cn(
                    'ml-auto rounded-pill px-2 py-0.5',
                    FAILURE_PILL[cls] ?? FAILURE_PILL.unknown,
                  )}
                >
                  {cls}
                </span>
              </div>
              {e.summary ? (
                <p className="mt-1.5 whitespace-pre-wrap text-sm text-foreground">
                  {e.summary}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default RetryHistoryView;
