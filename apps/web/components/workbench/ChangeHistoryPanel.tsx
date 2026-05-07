'use client';
import * as React from 'react';
import type { PlanListResponse } from '@ai-workflow/contracts';
import { api } from '../../lib/api-client';
import { cn } from '../../lib/cn';

const REVISION_PILL: Record<string, string> = {
  active: 'bg-accent-soft text-accent',
  superseded: 'bg-muted/10 text-muted',
  completed: 'bg-success/15 text-success',
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

function statusLabel(s: string): string {
  switch (s) {
    case 'active':
      return '当前';
    case 'superseded':
      return '已替换';
    case 'completed':
      return '已完成';
    default:
      return s;
  }
}

function shortId(id: string): string {
  const tail = id.includes('_') ? id.split('_').pop() : id;
  if (!tail) return id;
  return tail.length > 8 ? tail.slice(0, 8) : tail;
}

type PlanRevisionLike = PlanListResponse['revisions'][number];

/**
 * Read-only plan change history timeline. Lists every plan revision with its
 * short id, relative createdAt, status pill, and reason text. The "查看" link
 * fetches the raw revision JSON and shows an inline <pre> block. Archived
 * artifact paths (if any) are listed per-revision.
 */
export function ChangeHistoryPanel(props: {
  taskId: string;
}): React.JSX.Element {
  const { taskId } = props;
  const [data, setData] = React.useState<PlanListResponse | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<Record<string, unknown>>({});

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

  async function togglePreview(revisionId: string): Promise<void> {
    if (openId === revisionId) {
      setOpenId(null);
      return;
    }
    setOpenId(revisionId);
    if (preview[revisionId] !== undefined) return;
    try {
      const r = await api.getPlanRevision(taskId, revisionId);
      setPreview((p) => ({ ...p, [revisionId]: r as unknown as Record<string, unknown> }));
    } catch (e) {
      setPreview((p) => ({
        ...p,
        [revisionId]: { error: (e as Error).message },
      }));
    }
  }

  if (err) {
    return (
      <section className="p-4 text-sm text-muted">
        变更历史加载失败：{err}
      </section>
    );
  }
  if (!data) {
    return <section className="p-4 text-sm text-muted">加载中…</section>;
  }

  const revisions = [...data.revisions].sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <section className="flex flex-col gap-4 p-4">
      <div className="u-label">变更历史</div>
      {revisions.length === 0 ? (
        <div className="rounded-card border border-border bg-surface p-4 text-sm text-muted">
          当前任务暂无修订记录。
        </div>
      ) : (
        <ol className="relative ml-1 flex flex-col gap-3 border-l border-border pl-4">
          {revisions.map((r: PlanRevisionLike) => {
            const archived = extractArchivedIds(r);
            return (
              <li key={r.id} className="relative">
                <span
                  aria-hidden
                  className={cn(
                    'absolute -left-[calc(1rem+5px)] top-1.5 inline-block h-2.5 w-2.5 rounded-full border',
                    r.status === 'active'
                      ? 'border-accent bg-accent'
                      : 'border-muted bg-surface',
                  )}
                />
                <div className="rounded-card border border-border bg-surface px-3 py-2 shadow-soft">
                  <div className="flex items-center gap-2 text-xs">
                    <code className="text-muted">{shortId(r.id)}</code>
                    <span className="text-muted">·</span>
                    <span className="text-muted">
                      {relativeTime(r.createdAt)}
                    </span>
                    <span
                      className={cn(
                        'ml-auto rounded-pill px-2 py-0.5',
                        REVISION_PILL[r.status] ?? 'bg-muted/10 text-muted',
                      )}
                    >
                      {statusLabel(r.status)}
                    </span>
                  </div>
                  {r.reason ? (
                    <p className="mt-1.5 text-sm text-foreground">{r.reason}</p>
                  ) : null}
                  <div className="mt-2 flex items-center gap-3 text-xs">
                    <button
                      type="button"
                      onClick={() => void togglePreview(r.id)}
                      className="text-accent hover:underline"
                    >
                      {openId === r.id ? '收起' : '查看'}
                    </button>
                  </div>
                  {openId === r.id ? (
                    <pre className="mt-2 max-h-72 overflow-auto rounded-card bg-surface-strong p-2 text-xs text-foreground">
                      {JSON.stringify(preview[r.id] ?? { loading: true }, null, 2)}
                    </pre>
                  ) : null}
                  <div className="mt-2">
                    <div className="u-label mb-1">归档产物</div>
                    {archived.length === 0 ? (
                      <p className="text-xs text-muted">（无归档产物）</p>
                    ) : (
                      <ul className="flex flex-col gap-1 text-xs">
                        {archived.map((a) => (
                          <li key={a} className="truncate text-foreground">
                            {a}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function extractArchivedIds(rev: PlanRevisionLike): string[] {
  // Contract exposes `archivedArtifactPaths`; some backends also carry
  // `archivedArtifactIds`. Read both defensively.
  const out: string[] = [];
  const r = rev as unknown as Record<string, unknown>;
  const paths = r['archivedArtifactPaths'];
  if (Array.isArray(paths)) {
    for (const p of paths) if (typeof p === 'string') out.push(p);
  }
  const ids = r['archivedArtifactIds'];
  if (Array.isArray(ids)) {
    for (const i of ids) if (typeof i === 'string') out.push(i);
  }
  return out;
}

export default ChangeHistoryPanel;
