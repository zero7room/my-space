'use client';
import * as React from 'react';
import { useSseStore, type TaskEvent } from '../../lib/stores/sse';

function relTime(at: string | undefined): string {
  if (!at) return '';
  const ts = new Date(at).getTime();
  if (!Number.isFinite(ts)) return '';
  const diff = Date.now() - ts;
  const secs = Math.max(0, Math.floor(diff / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function LogViewer(props: { taskId: string }): React.JSX.Element {
  const { taskId } = props;
  const events = useSseStore(
    (s) => s.taskEvents[taskId] ?? (EMPTY as TaskEvent[]),
  );

  return (
    <section className="flex flex-col gap-3 p-4">
      <div className="u-label flex items-center justify-between">
        <span>任务日志</span>
        <span className="text-xs text-muted">{events.length} 条事件</span>
      </div>
      {events.length === 0 ? (
        <div className="rounded-card border border-border bg-surface p-4 text-sm text-muted">
          暂无任务事件。SSE 事件会实时追加到此处。
          <div className="mt-1 text-xs">taskId: {taskId}</div>
        </div>
      ) : (
        <ul
          aria-label="任务事件日志"
          className="max-h-[60vh] min-h-[120px] space-y-1 overflow-auto rounded-card border border-border bg-surface-strong p-2 font-mono text-xs text-foreground"
        >
          {events.map((ev) => (
            <li key={String(ev.id)} className="rounded border border-transparent px-2 py-1 hover:border-border">
              <details>
                <summary className="cursor-pointer list-none">
                  <span className="text-muted">[{ev.seq ?? '—'}]</span>{' '}
                  <span className="font-semibold text-accent">{ev.kind}</span>
                  <span className="ml-2 text-muted">· {relTime(ev.at)}</span>
                </summary>
                <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-surface p-2 text-[11px] text-muted">
                  {JSON.stringify(ev.payload ?? {}, null, 2)}
                </pre>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const EMPTY: TaskEvent[] = [];

export default LogViewer;
