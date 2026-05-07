'use client';
import * as React from 'react';
import { cn } from '../../lib/cn';
import { useConversationsStore } from '../../lib/stores/conversations';
import { useTasksStore } from '../../lib/stores/tasks';

export function WorkbenchHeader(props: {
  taskCount: number;
}): React.JSX.Element {
  const { taskCount } = props;
  const activeId = useConversationsStore((s) => s.activeId);
  const threads = useConversationsStore((s) => s.threads);
  const drawerOpen = useTasksStore((s) => s.drawerOpen);
  const setDrawerOpen = useTasksStore((s) => s.setDrawerOpen);

  const active = React.useMemo(
    () => threads.find((t) => t.id === activeId) ?? null,
    [threads, activeId],
  );

  const title = active?.title ?? '未选择会话';
  const status = active?.status ?? null;

  return (
    <div className="flex h-14 w-full items-center justify-between gap-4 px-5">
      <div className="flex min-w-0 items-center gap-3">
        <h1 className="truncate text-base font-semibold text-foreground">
          {title}
        </h1>
        {status ? (
          <span className="rounded-pill bg-accent-soft px-3 py-0.5 text-xs font-medium text-accent">
            {status}
          </span>
        ) : null}
      </div>
      <div className="flex flex-none items-center gap-2">
        <button
          type="button"
          onClick={() => setDrawerOpen(!drawerOpen)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-pill bg-accent px-4 py-1.5 text-sm font-medium text-white transition',
            'hover:-translate-y-px hover:shadow-soft',
          )}
          aria-pressed={drawerOpen}
          aria-label="切换任务抽屉"
        >
          <span>任务</span>
          <span className="rounded-pill bg-white/20 px-2 py-0.5 text-xs font-semibold">
            {taskCount}
          </span>
        </button>
      </div>
    </div>
  );
}
