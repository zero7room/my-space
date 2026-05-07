'use client';
import * as React from 'react';
import type { TaskActionResponse } from '@ai-workflow/contracts';
import { api } from '../../lib/api-client';
import { cn } from '../../lib/cn';
import { useTasksStore } from '../../lib/stores/tasks';

type ArtifactLike = {
  id: string;
  relativePath: string;
  sha256?: string;
  sizeBytes?: number;
  status?: 'active' | 'archived';
  drifted?: boolean;
};

function shortSha(sha: string | undefined): string {
  return sha ? sha.slice(0, 8) : '—';
}

function formatSize(n: number | undefined): string {
  if (!n && n !== 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Task artifact list. Pulls artifacts from the task payload when exposed
 * (`task.artifacts`), falls back to `artifactIds` + per-id `getArtifact` fetches
 * when available. For each artifact, shows metadata, action buttons (preview,
 * download disabled, reseal), and a `drifted` warning ring if SSE has reported
 * `artifact_consistency_warning` for that artifact.
 */
export function ArtifactPanel(props: { taskId: string }): React.JSX.Element {
  const { taskId } = props;
  const [items, setItems] = React.useState<ArtifactLike[] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [previewId, setPreviewId] = React.useState<string | null>(null);
  const [previewData, setPreviewData] = React.useState<
    Record<string, unknown>
  >({});
  const [downloadInfo, setDownloadInfo] = React.useState<ArtifactLike | null>(
    null,
  );
  const drifted = useTasksStore((s) => s.driftedArtifacts);
  const clearArtifactDrift = useTasksStore((s) => s.clearArtifactDrift);

  const refresh = React.useCallback(async () => {
    setErr(null);
    try {
      const res: TaskActionResponse = await api.getTask(taskId);
      const taskRaw = res.task as unknown as Record<string, unknown>;
      const inline = taskRaw['artifacts'];
      if (Array.isArray(inline)) {
        const list = inline
          .map((a) => normalizeArtifact(a))
          .filter((a): a is ArtifactLike => a !== null)
          .filter((a) => (a.relativePath ?? '').startsWith('outputs/'));
        setItems(list);
        return;
      }
      const ids = Array.isArray(taskRaw['artifactIds'])
        ? (taskRaw['artifactIds'] as string[]).filter(
            (s) => typeof s === 'string',
          )
        : [];
      if (ids.length === 0) {
        setItems([]);
        return;
      }
      const fetched = await Promise.all(
        ids.map(async (id) => {
          try {
            const r = await api.getArtifact(id);
            const rec =
              (r as unknown as Record<string, unknown> | null)?.['artifact'] ??
              (r as unknown as Record<string, unknown>);
            return normalizeArtifact(rec);
          } catch {
            return null;
          }
        }),
      );
      setItems(
        fetched
          .filter((a): a is ArtifactLike => a !== null)
          .filter((a) => (a.relativePath ?? '').startsWith('outputs/')),
      );
    } catch (e) {
      setErr((e as Error).message);
      setItems([]);
    }
  }, [taskId]);

  React.useEffect(() => {
    setItems(null);
    void refresh();
  }, [refresh]);

  async function handleReseal(id: string): Promise<void> {
    setBusy(id);
    try {
      await api.resealArtifact(id);
      clearArtifactDrift(id);
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handlePreview(id: string): Promise<void> {
    if (previewId === id) {
      setPreviewId(null);
      return;
    }
    setPreviewId(id);
    if (previewData[id] !== undefined) return;
    try {
      const r = await api.getArtifact(id);
      setPreviewData((p) => ({
        ...p,
        [id]: r as unknown as Record<string, unknown>,
      }));
    } catch (e) {
      setPreviewData((p) => ({ ...p, [id]: { error: (e as Error).message } }));
    }
  }

  if (err && items === null) {
    return (
      <section className="p-4 text-sm text-muted">
        产物加载失败：{err}
      </section>
    );
  }
  if (items === null) {
    return <section className="p-4 text-sm text-muted">加载中…</section>;
  }
  if (items.length === 0) {
    return (
      <section className="p-4 text-sm text-muted">
        当前任务暂无产物。
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3 p-4">
      <div className="u-label">任务产物</div>
      {err ? (
        <div className="rounded-card border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
          {err}
        </div>
      ) : null}
      <ul className="flex flex-col gap-2">
        {items.map((a) => {
          const driftReason = drifted[a.id];
          const isDrifted = a.drifted || Boolean(driftReason);
          return (
            <li
              key={a.id}
              className={cn(
                'rounded-card border bg-surface px-3 py-2 shadow-soft',
                isDrifted ? 'border-danger border-2' : 'border-border',
              )}
            >
              {isDrifted ? (
                <div className="mb-2 rounded-card bg-danger/10 px-2 py-1 text-xs text-danger">
                  {driftReason ??
                    'sha256 不一致：与上一次校验结果不同，请检查产物是否被外部修改。'}
                </div>
              ) : null}
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                  {a.relativePath}
                </span>
                <span
                  className={cn(
                    'flex-none rounded-pill px-2 py-0.5 text-xs',
                    a.status === 'archived'
                      ? 'bg-muted/10 text-muted'
                      : 'bg-success/15 text-success',
                  )}
                >
                  {a.status === 'archived' ? '已归档' : '激活'}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
                <span>sha256 {shortSha(a.sha256)}</span>
                {a.sizeBytes !== undefined ? (
                  <span>{formatSize(a.sizeBytes)}</span>
                ) : null}
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => void handlePreview(a.id)}
                  className="rounded-pill border border-border bg-surface px-2 py-1 text-foreground transition hover:-translate-y-px hover:text-accent"
                >
                  {previewId === a.id ? '收起预览' : '预览'}
                </button>
                <button
                  type="button"
                  onClick={() => setDownloadInfo(a)}
                  title="v1：显示宿主机路径"
                  className="rounded-pill border border-border bg-surface px-2 py-1 text-foreground transition hover:-translate-y-px hover:text-accent"
                >
                  下载（v1.1）
                </button>
                <button
                  type="button"
                  onClick={() => void handleReseal(a.id)}
                  disabled={busy === a.id}
                  className="rounded-pill border border-border bg-surface px-2 py-1 text-foreground transition hover:-translate-y-px hover:text-accent disabled:opacity-50"
                >
                  {busy === a.id ? '重算中…' : '重算 sha256'}
                </button>
              </div>
              {previewId === a.id ? (
                <pre className="mt-2 max-h-64 overflow-auto rounded-card bg-surface-strong p-2 text-xs text-foreground">
                  {JSON.stringify(
                    previewData[a.id] ?? { loading: true },
                    null,
                    2,
                  )}
                </pre>
              ) : null}
            </li>
          );
        })}
      </ul>
      {downloadInfo ? (
        <ArtifactLocationModal
          taskId={taskId}
          artifact={downloadInfo}
          onClose={() => setDownloadInfo(null)}
        />
      ) : null}
    </section>
  );
}

function ArtifactLocationModal(props: {
  taskId: string;
  artifact: ArtifactLike;
  onClose: () => void;
}): React.JSX.Element {
  const { taskId, artifact, onClose } = props;
  const runtimeId =
    (typeof process !== 'undefined'
      ? process.env['NEXT_PUBLIC_RUNTIME_ID']
      : undefined) ?? '<runtime-id>';
  const hostPath = `data/instances/${runtimeId}/state/tasks/${taskId}/outputs/${artifact.relativePath.replace(
    /^outputs\//,
    '',
  )}`;
  const [copied, setCopied] = React.useState(false);

  async function copyPath(): Promise<void> {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(hostPath);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-foreground/30 backdrop-blur-sm">
      <div className="w-[min(92vw,560px)] rounded-panel bg-surface-raised p-6 shadow-medium">
        <div className="u-label mb-1">产物下载</div>
        <h3 className="text-base font-semibold text-foreground">
          下载链路计划在 v1.1 开放
        </h3>
        <p className="mt-2 text-sm text-muted">
          在 v1 localhost 环境下，可直接从宿主机文件系统查看该产物：
        </p>
        <div className="mt-3 rounded-card bg-surface p-3">
          <div className="u-label mb-1">宿主机路径</div>
          <code className="block break-all font-mono text-sm text-foreground">
            {hostPath}
          </code>
        </div>
        <div className="mt-3 rounded-card border border-border bg-surface p-3 text-xs text-muted">
          <div>
            <span className="u-label">相对路径</span>
            <div className="mt-0.5 break-all font-mono text-foreground">
              {artifact.relativePath}
            </div>
          </div>
          {artifact.sha256 ? (
            <div className="mt-2">
              <span className="u-label">sha256</span>
              <div className="mt-0.5 break-all font-mono text-foreground">
                {artifact.sha256}
              </div>
            </div>
          ) : null}
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => void copyPath()}
            className="rounded-pill border border-border bg-surface px-4 py-2 text-sm text-foreground hover:-translate-y-px"
          >
            {copied ? '已复制' : '复制路径'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-pill bg-accent px-4 py-2 text-sm text-white shadow-soft hover:-translate-y-px"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

function normalizeArtifact(raw: unknown): ArtifactLike | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = r['id'];
  const relativePath = r['relativePath'];
  if (typeof id !== 'string' || typeof relativePath !== 'string') return null;
  const sha = r['sha256'];
  const size = r['sizeBytes'];
  const status = r['status'];
  const drifted = r['drifted'];
  return {
    id,
    relativePath,
    sha256: typeof sha === 'string' ? sha : undefined,
    sizeBytes: typeof size === 'number' ? size : undefined,
    status:
      status === 'active' || status === 'archived' ? status : undefined,
    drifted: drifted === true,
  };
}

export default ArtifactPanel;
