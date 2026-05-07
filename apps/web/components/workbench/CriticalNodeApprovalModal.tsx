'use client';
import * as React from 'react';
import { api } from '../../lib/api-client';
import { showError, showSuccess } from './ToastProvider';

type Matcher =
  | { kind: 'tool'; toolName: string; argMatch?: Record<string, unknown> }
  | { kind: 'skill'; riskClass?: 'low' | 'medium' | 'high'; skillName?: string }
  | { kind: 'external_io'; direction: 'outbound'; provider?: string }
  | { kind: 'filesystem'; op: 'delete' | 'overwrite'; minCount?: number }
  | { kind: 'budget_overflow'; dim: 'time' | 'tokens' | 'subagents' | 'cost' }
  | { kind: 'out_of_scope'; planRevisionId: string };

export type CriticalNodeHit = {
  taskId: string;
  policyId: string;
  matcher: Matcher;
  reason: string;
  at: string;
};

function describeMatcher(m: Matcher): React.ReactNode {
  switch (m.kind) {
    case 'tool':
      return (
        <>
          即将调用工具 <code className="font-mono">{m.toolName}</code>
          {m.argMatch ? (
            <>
              {' '}（参数匹配 <code className="font-mono">{JSON.stringify(m.argMatch)}</code>）
            </>
          ) : null}
        </>
      );
    case 'skill':
      return (
        <>
          即将加载技能 <code className="font-mono">{m.skillName ?? '(任意)'}</code>
          {m.riskClass ? <>（风险等级：{m.riskClass}）</> : null}
        </>
      );
    case 'external_io':
      return (
        <>
          即将向外发送信息（{m.direction === 'outbound' ? '出站' : '入站'}
          {m.provider ? ` · ${m.provider}` : ''}）
        </>
      );
    case 'filesystem':
      return (
        <>
          文件系统操作：{m.op === 'delete' ? '删除' : '覆盖'}
          {m.minCount ? ` ≥ ${m.minCount} 个文件` : ''}
        </>
      );
    case 'budget_overflow':
      return (
        <>
          预算即将超限（
          {m.dim === 'time'
            ? '时间'
            : m.dim === 'tokens'
              ? 'Tokens'
              : m.dim === 'subagents'
                ? '子代理数'
                : '成本'}
          ）
        </>
      );
    case 'out_of_scope':
      return <>超出当前计划范围（revision {m.planRevisionId.slice(0, 8)}）</>;
    default:
      return <>未知策略类型</>;
  }
}

export function CriticalNodeApprovalModal(props: {
  hit: CriticalNodeHit | null;
  onClose: () => void;
  onResolved?: () => void;
}): React.JSX.Element | null {
  const [busy, setBusy] = React.useState(false);
  if (!props.hit) return null;
  const h = props.hit;

  async function decide(kind: 'approve' | 'reject'): Promise<void> {
    setBusy(true);
    try {
      if (kind === 'approve') await api.approveCriticalNode(h.taskId);
      else await api.rejectCriticalNode(h.taskId);
      showSuccess(kind === 'approve' ? '已审批通过' : '已驳回');
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
      <div className="w-[min(92vw,540px)] rounded-panel bg-surface-raised p-6 shadow-medium">
        <div className="u-label mb-2">关键节点审批</div>
        <h2 className="text-lg font-semibold text-foreground">需要人工确认</h2>
        <div className="mt-4 space-y-2 rounded-card bg-surface p-4 text-sm">
          <div>
            <span className="u-label">类型</span>
            <div className="mt-1 font-medium">{h.matcher.kind}</div>
          </div>
          <div>
            <span className="u-label">详情</span>
            <div className="mt-1 text-sm text-foreground leading-relaxed">
              {describeMatcher(h.matcher)}
            </div>
            <details className="mt-2 text-xs text-muted">
              <summary className="cursor-pointer select-none hover:text-foreground">
                查看原始详情
              </summary>
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-surface-strong p-2 text-xs text-muted">
                {JSON.stringify(h.matcher, null, 2)}
              </pre>
            </details>
          </div>
          <div>
            <span className="u-label">原因</span>
            <div className="mt-1 text-foreground">{h.reason}</div>
          </div>
          <div>
            <span className="u-label">时间</span>
            <div className="mt-1 text-muted">{h.at}</div>
          </div>
        </div>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => decide('reject')}
            className="rounded-pill border border-border bg-surface px-4 py-2 text-sm hover:-translate-y-px"
          >
            驳回
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => decide('approve')}
            className="rounded-pill bg-accent px-4 py-2 text-sm text-white shadow-soft hover:-translate-y-px disabled:opacity-50"
          >
            批准
          </button>
        </div>
        <button
          type="button"
          onClick={props.onClose}
          className="mt-3 block w-full text-xs text-muted"
        >
          关闭
        </button>
      </div>
    </div>
  );
}
