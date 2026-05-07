'use client';
import * as React from 'react';
import { cn } from '../../lib/cn';
import { useTasksStore } from '../../lib/stores/tasks';

type TabId = 'summary' | 'plan' | 'changes' | 'log' | 'retry' | 'team' | 'artifact';

const TABS: ReadonlyArray<{ id: TabId; label: string }> = [
  { id: 'summary', label: '摘要' },
  { id: 'plan', label: '计划' },
  { id: 'changes', label: '变更' },
  { id: 'log', label: '日志' },
  { id: 'retry', label: '重试历史' },
  { id: 'team', label: '团队' },
  { id: 'artifact', label: '产物' },
];

/**
 * Horizontal tab strip shown inside the task detail header. The active tab is
 * underlined and tinted with the accent color; inactive tabs use the muted
 * foreground token.
 */
export function TaskDetailTabs(props: {
  activeTab: TabId;
}): React.JSX.Element {
  const { activeTab } = props;
  const setDetailTab = useTasksStore((s) => s.setDetailTab);

  return (
    <div
      role="tablist"
      aria-label="任务详情 tab"
      className="flex items-center gap-1 overflow-x-auto border-b border-border"
    >
      {TABS.map((t) => {
        const active = t.id === activeTab;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => setDetailTab(t.id)}
            className={cn(
              '-mb-px flex-none border-b-2 px-3 py-2 text-sm transition',
              active
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export default TaskDetailTabs;
