'use client';
import * as React from 'react';

/**
 * Task log viewer. The v1 scope of this component is intentionally minimal —
 * P0-C will wire ThreadSseClient / useSseStore into the `buffer` state below to
 * render a live tail of events filtered by `taskId`. For now this shows a
 * placeholder card + an empty <pre> buffer so the plumbing is ready when P0-C
 * lands.
 */
export function LogViewer(props: { taskId: string }): React.JSX.Element {
  const { taskId } = props;
  // P0-C: hook SSE filtered by taskId to fill logs
  const [buffer, _setBuffer] = React.useState<string>('');

  return (
    <section className="flex flex-col gap-3 p-4">
      <div className="u-label">任务日志</div>
      <div className="rounded-card border border-border bg-surface p-4 text-sm text-muted">
        日志视图 v1 读取 task events.jsonl 最近 200 行 — 待 P0-C 接入。
        <div className="mt-1 text-xs">taskId: {taskId}</div>
      </div>
      <pre
        aria-label="任务事件日志"
        className="max-h-[60vh] min-h-[120px] overflow-auto whitespace-pre-wrap break-words rounded-card border border-border bg-surface-strong p-3 font-mono text-xs text-foreground"
      >
        {buffer.length > 0
          ? buffer
          : '（等待 SSE 事件注入；请切换到对话视图查看实时事件流。）'}
      </pre>
    </section>
  );
}

export default LogViewer;
