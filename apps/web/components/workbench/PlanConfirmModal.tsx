'use client';
import * as React from 'react';
import { api } from '../../lib/api-client';
import { showError, showSuccess } from './ToastProvider';

type PlanStep = { id: string; title: string; status?: string; description?: string };

export function PlanConfirmModal(props: {
  taskId: string | null;
  revisionId: string | null;
  plan: { objective?: string; steps?: PlanStep[] } | null;
  onClose: () => void;
  onResolved?: () => void;
}): React.JSX.Element | null {
  const [busy, setBusy] = React.useState(false);
  if (!props.taskId || !props.revisionId || !props.plan) return null;
  const { objective = '', steps = [] } = props.plan;

  async function decide(kind: 'confirm' | 'reject'): Promise<void> {
    setBusy(true);
    try {
      if (kind === 'confirm') await api.confirmPlan(props.taskId!, props.revisionId!);
      else await api.rejectPlan(props.taskId!, props.revisionId!);
      showSuccess(kind === 'confirm' ? '计划已确认' : '计划已驳回');
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
      <div className="w-[min(92vw,640px)] rounded-panel bg-surface-raised p-6 shadow-medium">
        <div className="u-label mb-2">计划确认</div>
        <h2 className="text-lg font-semibold">{objective || '（无目标描述）'}</h2>
        <div className="mt-4 max-h-80 space-y-2 overflow-auto rounded-card bg-surface p-4">
          {steps.length === 0 ? (
            <div className="text-sm text-muted">（计划暂无步骤）</div>
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
            放弃
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => decide('confirm')}
            className="rounded-pill bg-accent px-4 py-2 text-sm text-white shadow-soft disabled:opacity-50"
          >
            确认并开始
          </button>
        </div>
      </div>
    </div>
  );
}
