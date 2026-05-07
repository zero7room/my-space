'use client';
import * as React from 'react';
import { api } from '../../lib/api-client';
import { cn } from '../../lib/cn';
import { useConversationsStore } from '../../lib/stores/conversations';
import { useTasksStore } from '../../lib/stores/tasks';

function relativeTime(iso: string): string {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return '';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  return `${days}天前`;
}

export function Sidebar(props: {
  onOpenFeishuConfig: () => void;
  onDelete?: (id: string) => void | Promise<void>;
}): React.JSX.Element {
  const { onOpenFeishuConfig, onDelete } = props;
  const threads = useConversationsStore((s) => s.threads);
  const activeId = useConversationsStore((s) => s.activeId);
  const setThreads = useConversationsStore((s) => s.setThreads);
  const setActive = useConversationsStore((s) => s.setActive);
  const upsertThread = useConversationsStore((s) => s.upsertThread);
  const setLoading = useConversationsStore((s) => s.setLoading);
  const drawerOpen = useTasksStore((s) => s.drawerOpen);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listThreads()
      .then((res) => {
        if (cancelled) return;
        setThreads(res.threads);
      })
      .catch(() => {
        /* ignore in v1 — degraded banner will surface transport issues */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [setThreads, setLoading]);

  const handleCreate = React.useCallback(async () => {
    const title =
      typeof window !== 'undefined'
        ? window.prompt('新对话标题', '未命名对话')
        : undefined;
    if (title === null) return; // user cancelled
    try {
      const res = await api.createThread(
        title && title.trim().length > 0 ? { title: title.trim() } : {},
      );
      upsertThread(res.thread);
      setActive(res.thread.id);
    } catch {
      /* swallow — a toast system can be added later */
    }
  }, [upsertThread, setActive]);

  const handleSelect = React.useCallback(
    (id: string) => {
      setActive(id);
    },
    [setActive],
  );

  const handleDelete = React.useCallback(
    (id: string) => {
      if (onDelete) {
        void onDelete(id);
      }
    },
    [onDelete],
  );

  if (drawerOpen) {
    // Collapsed: icon-only rail
    return (
      <div
        aria-label="会话轨道"
        className="flex h-full w-full flex-col items-center bg-transparent py-4"
      >
        <button
          type="button"
          onClick={handleCreate}
          aria-label="新对话"
          className="mb-3 flex h-10 w-10 items-center justify-center rounded-pill border border-border bg-surface text-base text-accent shadow-[0_8px_18px_rgba(90,68,42,0.06)] transition hover:-translate-y-px"
        >
          +
        </button>
        <ul className="flex w-full flex-1 flex-col items-center gap-2 overflow-y-auto px-3 pb-2">
          {threads.slice(0, 12).map((t, index) => {
            const isActive = t.id === activeId;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => handleSelect(t.id)}
                  aria-label={`会话 ${index + 1}`}
                  aria-current={isActive ? 'page' : undefined}
                  title={t.title || t.id}
                  className={cn(
                    'h-9 w-9 rounded-pill border text-xs transition hover:-translate-y-px',
                    isActive
                      ? 'border-accent bg-accent-soft text-accent'
                      : 'border-transparent bg-surface text-muted hover:border-border hover:text-foreground',
                  )}
                >
                  {index + 1}
                </button>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={onOpenFeishuConfig}
          aria-label="飞书配置"
          className="mt-auto flex h-10 w-10 items-center justify-center rounded-pill border border-border bg-surface text-xs text-accent shadow-[0_8px_18px_rgba(90,68,42,0.06)] transition hover:-translate-y-px"
        >
          飞
        </button>
      </div>
    );
  }

  // Expanded: full conversation list
  return (
    <div className="flex h-full w-full flex-col bg-transparent">
      <div className="px-4 pb-2 pt-5">
        <div className="u-label mb-3">Conversations</div>
        <button
          type="button"
          onClick={handleCreate}
          className="w-full rounded-pill border border-border bg-surface px-4 py-2.5 text-left text-sm text-foreground shadow-[0_8px_18px_rgba(90,68,42,0.06)] transition hover:-translate-y-px"
        >
          + 新对话
        </button>
      </div>

      <ul className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {threads.map((t) => {
          const isActive = t.id === activeId;
          const label = t.title && t.title.length > 0 ? t.title : t.id;
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => handleSelect(t.id)}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'group relative flex w-full flex-col items-start rounded-card border px-4 py-3 text-left transition hover:-translate-y-px',
                  isActive
                    ? 'border-accent bg-accent-soft text-foreground shadow-[0_12px_26px_rgba(90,68,42,0.06)]'
                    : 'border-transparent text-muted hover:border-border hover:bg-surface-raised hover:text-foreground',
                )}
              >
                <span className="w-full truncate pr-6 text-sm font-medium">
                  {label}
                </span>
                <span className="mt-1 text-xs text-muted">
                  {relativeTime(t.updatedAt)}
                </span>
                {onDelete ? (
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label="删除对话"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(t.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.stopPropagation();
                        e.preventDefault();
                        handleDelete(t.id);
                      }
                    }}
                    className="absolute right-3 top-3 hidden rounded-pill px-2 py-1 text-xs text-muted hover:bg-danger/10 hover:text-danger group-hover:inline-flex"
                  >
                    ×
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-border px-4 py-4">
        <button
          type="button"
          onClick={onOpenFeishuConfig}
          className="w-full rounded-pill border border-border bg-surface px-4 py-2.5 text-center text-sm text-foreground shadow-[0_8px_18px_rgba(90,68,42,0.06)] transition hover:-translate-y-px"
        >
          飞书配置
        </button>
      </div>
    </div>
  );
}

export default Sidebar;
