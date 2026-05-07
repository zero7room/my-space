'use client';
import * as React from 'react';
import { useTasksStore } from '../../lib/stores/tasks';
import { TaskDetailPanel } from './TaskDetailPanel';
import { TaskListPanel } from './TaskListPanel';

/**
 * Root container for the task drawer. Shows either the list view (when no task
 * is selected) or the detail view (when `selectedId` is set). Includes a top
 * strip with a close button and an optional back-to-list button.
 */
export function TaskDrawer(props: {
  threadId: string | null;
}): React.JSX.Element {
  const { threadId } = props;
  const selectedId = useTasksStore((s) => s.selectedId);
  const setSelected = useTasksStore((s) => s.setSelected);
  const setDrawerOpen = useTasksStore((s) => s.setDrawerOpen);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-none items-center justify-between gap-3 border-b border-border px-4 py-3">
        {selectedId !== null ? (
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="rounded-pill border border-border bg-surface px-3 py-1 text-xs text-foreground transition hover:-translate-y-px hover:text-accent"
          >
            ← 返回列表
          </button>
        ) : (
          <div className="u-label">任务</div>
        )}
        <div className="flex items-center gap-2">
          {selectedId !== null ? (
            <span className="u-label">任务</span>
          ) : null}
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="关闭任务抽屉"
            className="flex h-8 w-8 items-center justify-center rounded-pill border border-border bg-surface text-sm text-muted transition hover:-translate-y-px hover:text-danger"
          >
            ×
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {selectedId === null ? (
          <TaskListPanel threadId={threadId} />
        ) : (
          <TaskDetailPanel taskId={selectedId} />
        )}
      </div>
    </div>
  );
}

export default TaskDrawer;
