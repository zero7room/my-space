'use client';
import * as React from 'react';
import { api } from '../../lib/api-client';
import { showError, showSuccess } from './ToastProvider';

type PlanStep = { id: string; title: string; description?: string };

export function ChangeConfirmModal(props: {
  taskId: string | null;
  oldRevisionId: string | null;
  newRevisionId: string | null;
  newPlan: { objective?: string; steps?: PlanStep[] } | null;
  archivedArtifactCount?: number;
  changeSummary?: string;
  onClose: () => void;
  onResolved?: () => void;
}): React.JSX.Element | null {
  const [busy, setBusy] = React.useState(false);
  if (!props.taskId || !props.newRevisionId || !props.newPlan) return null;
  const { objective = '', steps = [] } = props.newPlan;
  const archivedCount = props.archivedArtifactCount ?? 0;

  async function decide(kind: 'confirm' | 'reject'): Promise<void> {
    setBusy(true);
    try {
      if (kind === 'confirm') await api.confirmPlan(props.taskId!, props.newRevisionId!);
      else await api.rejectPlan(props.taskId!, props.newRevisionId!);
      showSuccess(kind === 'confirm' ? '变更已确认' : '变更已取消');
      props.onResolved?.();
      props.onClose();
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-foreground/30 backdrop-blur-sm">
      <div className="w-[min(92vw,680px)] rounded-panel bg-surface-raised p-6 shadow-medium">
        <div className="u-label mb-2">计划变更确认</div>
        <h2 className="text-lg font-semibold">{objective || '（无目标描述）'}</h2>

        <div className="mt-4 rounded-card border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          此变更将归档当前 {archivedCount} 个产物并切换到新计划。
        </div>

        {props.changeSummary ? (
          <div className="mt-4 rounded-card bg-surface p-3 text-sm text-foreground">
            <div className="u-label mb-1">变更摘要</div>
            <div className="whitespace-pre-wrap text-muted">{props.changeSummary}</div>
          </div>
        ) : null}

        <div className="mt-4 max-h-64 space-y-2 overflow-auto rounded-card bg-surface p-4">
          <div className="u-label mb-1">新计划步骤</div>
          {steps.length === 0 ? (
            <div className="text-sm text-muted">（新计划暂无步骤）</div>
          ) : (
            steps.map((s, i) => (
              <div
                key={s.id}
                className="rounded border border-border bg-surface-raised px-3 py-2 text-sm"
              >
                <div className="font-medium">
                  {i + 1}. {s.title}
                </div>
                {s.description ? (
                  <div className="mt-1 text-xs text-muted">{s.description}</div>
                ) : null}
              </div>
            ))
          )}
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => decide('reject')}
            className="rounded-pill border border-border bg-surface px-4 py-2 text-sm"
          >
            取消变更
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => decide('confirm')}
            className="rounded-pill bg-accent px-4 py-2 text-sm text-white shadow-soft disabled:opacity-50"
          >
            确认变更
          </button>
        </div>
      </div>
    </div>
  );
}
