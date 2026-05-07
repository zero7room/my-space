'use client';
import * as React from 'react';
import type { EventEnvelope } from '@ai-workflow/contracts';
import { api } from '../../lib/api-client';
import { ThreadSseClient } from '../../lib/sse-client';
import { useConversationsStore } from '../../lib/stores/conversations';
import { useTasksStore } from '../../lib/stores/tasks';
import { useSseStore } from '../../lib/stores/sse';
import { WorkbenchShell } from './WorkbenchShell';
import { Sidebar } from './Sidebar';
import { WorkbenchHeader } from './Header';
import { ChatWindow } from './ChatWindow';
import { TaskDrawer } from './TaskDrawer';
import { ToastContainer, showInfo } from './ToastProvider';
import {
  CriticalNodeApprovalModal,
  type CriticalNodeHit,
} from './CriticalNodeApprovalModal';
import { PlanConfirmModal } from './PlanConfirmModal';
import { ChangeConfirmModal } from './ChangeConfirmModal';
import { FeishuConfigSheet } from './FeishuConfigSheet';
import { ChannelsDrawer } from './ChannelsDrawer';

type PlanStep = { id: string; title: string; status?: string; description?: string };
type PlanLike = { objective?: string; steps?: PlanStep[] };

type PlanConfirmState = {
  taskId: string;
  revisionId: string;
  plan: PlanLike;
};

type ChangeConfirmState = {
  taskId: string;
  oldRevisionId: string | null;
  newRevisionId: string;
  newPlan: PlanLike;
  archivedArtifactCount: number;
  changeSummary: string;
};

type Props = {
  initialThreadId?: string | null;
  initialTaskId?: string;
  drawerOpen?: boolean;
  initialDeepLink?: 'policies' | 'channels' | null;
};

function toStr(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function asPlan(raw: unknown): PlanLike {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  // Try common envelopes: { plan: { objective, steps } } or directly.
  const inner =
    (r['plan'] && typeof r['plan'] === 'object' && (r['plan'] as Record<string, unknown>)) ||
    (r['revision'] && typeof r['revision'] === 'object' && (r['revision'] as Record<string, unknown>)) ||
    r;
  const obj = (inner as Record<string, unknown>) ?? {};
  const objective = typeof obj['objective'] === 'string' ? obj['objective'] : undefined;
  const stepsRaw = obj['steps'];
  const steps: PlanStep[] = Array.isArray(stepsRaw)
    ? (stepsRaw
        .map((s): PlanStep | null => {
          if (!s || typeof s !== 'object') return null;
          const x = s as Record<string, unknown>;
          const id = typeof x['id'] === 'string' ? x['id'] : undefined;
          const title = typeof x['title'] === 'string' ? x['title'] : undefined;
          if (!id || !title) return null;
          return {
            id,
            title,
            status: typeof x['status'] === 'string' ? x['status'] : undefined,
            description:
              typeof x['description'] === 'string' ? x['description'] : undefined,
          };
        })
        .filter((x): x is PlanStep => x !== null))
    : [];
  return { objective, steps };
}

function EmptyState(): React.JSX.Element {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="rounded-panel bg-surface-raised px-8 py-10 text-center shadow-medium">
        <div className="u-label">Workbench</div>
        <div className="mt-3 text-base font-semibold text-foreground">
          准备就绪
        </div>
        <div className="mt-2 max-w-md text-sm text-muted">
          选择左侧会话或 + 新建对话 开始和 AI 员工协作。
        </div>
      </div>
    </div>
  );
}

function PoliciesNotice(): React.JSX.Element {
  return (
    <div className="border-b border-border bg-warning/10 px-5 py-3 text-xs text-warning">
      策略管理 v1 通过 /api/critical-node-policies 配置，图形化面板暂缺（见 requirement §6.8）。
    </div>
  );
}

export function WorkbenchPage(props: Props = {}): React.JSX.Element {
  const { initialThreadId, initialTaskId, drawerOpen, initialDeepLink } = props;

  const activeId = useConversationsStore((s) => s.activeId);
  const setActive = useConversationsStore((s) => s.setActive);
  const threads = useConversationsStore((s) => s.threads);
  const setSelected = useTasksStore((s) => s.setSelected);
  const setDrawerOpen = useTasksStore((s) => s.setDrawerOpen);
  const setBlocked = useTasksStore((s) => s.setBlocked);
  const markArtifactDrifted = useTasksStore((s) => s.markArtifactDrifted);
  const appendTaskEvent = useSseStore((s) => s.appendTaskEvent);

  const [criticalNodeHit, setCriticalNodeHit] =
    React.useState<CriticalNodeHit | null>(null);
  const [planConfirm, setPlanConfirm] = React.useState<PlanConfirmState | null>(
    null,
  );
  const [changeConfirm, setChangeConfirm] =
    React.useState<ChangeConfirmState | null>(null);
  const [feishuOpen, setFeishuOpen] = React.useState(false);
  const [channelsDrawerOpen, setChannelsDrawerOpen] = React.useState(false);

  // Initial deep-links / selection wiring
  const initRanRef = React.useRef(false);
  React.useEffect(() => {
    if (initRanRef.current) return;
    initRanRef.current = true;
    if (initialDeepLink === 'channels') setChannelsDrawerOpen(true);
    if (initialThreadId) setActive(initialThreadId);
    if (drawerOpen) setDrawerOpen(true);
    if (initialTaskId) {
      // Resolve the thread for the task, then activate.
      void api
        .getTask(initialTaskId)
        .then((res) => {
          const threadId = res?.task?.threadId;
          if (threadId) setActive(threadId);
          setSelected(initialTaskId);
          setDrawerOpen(true);
        })
        .catch(() => {
          /* surfaced via degraded state if SSE is also down */
        });
    }
  }, [
    initialDeepLink,
    initialThreadId,
    initialTaskId,
    drawerOpen,
    setActive,
    setSelected,
    setDrawerOpen,
  ]);

  // SSE event dispatcher
  const handleEvent = React.useCallback(
    (ev: EventEnvelope) => {
      const kind = ev.kind as string;
      const payload = (ev.payload ?? {}) as Record<string, unknown>;
      const taskId = toStr(ev.taskId) || toStr(payload['taskId']);

      if (taskId) {
        appendTaskEvent(taskId, {
          id: ev.id,
          kind: ev.kind,
          at: ev.at,
          payload: ev.payload,
          seq: ev.seq,
        });
      }

      switch (kind) {
        case 'critical_node_hit': {
          // Accept either flat or wrapped in { hit: ... }
          const wrap = payload['hit'];
          const src =
            wrap && typeof wrap === 'object'
              ? (wrap as Record<string, unknown>)
              : payload;
          const matcher = src['matcher'];
          if (!matcher || typeof matcher !== 'object') return;
          const hit: CriticalNodeHit = {
            taskId: toStr(src['taskId']) || taskId,
            policyId: toStr(src['policyId']),
            matcher: matcher as CriticalNodeHit['matcher'],
            reason: toStr(src['reason']),
            at: toStr(src['at']) || ev.at,
          };
          setCriticalNodeHit(hit);
          return;
        }
        case 'plan_pending_confirmation':
        case 'plan_drafted': {
          if (payload['autoConfirm'] === true) return;
          const revisionId = toStr(payload['revisionId']);
          if (!taskId || !revisionId) return;
          void api
            .getPlanRevision(taskId, revisionId)
            .then((res) => {
              setPlanConfirm({ taskId, revisionId, plan: asPlan(res) });
            })
            .catch(() => {
              /* swallow — surface via degraded if relevant */
            });
          return;
        }
        case 'plan_revising': {
          const newRev = toStr(payload['newRevisionId']) || toStr(payload['revisionId']);
          const oldRev = toStr(payload['oldRevisionId']) || null;
          if (!taskId || !newRev) return;
          const archivedRaw = payload['archivedArtifactIds'];
          const archivedArtifactCount = Array.isArray(archivedRaw)
            ? archivedRaw.length
            : 0;
          const changeSummary = toStr(payload['reason']);
          void api
            .getPlanRevision(taskId, newRev)
            .then((res) => {
              setChangeConfirm({
                taskId,
                oldRevisionId: oldRev,
                newRevisionId: newRev,
                newPlan: asPlan(res),
                archivedArtifactCount,
                changeSummary,
              });
            })
            .catch(() => {
              /* swallow */
            });
          return;
        }
        case 'task_blocked': {
          if (!taskId) return;
          const blockedReason = toStr(payload['blockedReason']) || '任务已阻塞';
          const sa = payload['suggestedActions'];
          const suggestedActions = Array.isArray(sa)
            ? sa.filter((x): x is string => typeof x === 'string')
            : [];
          setBlocked(taskId, { taskId, blockedReason, suggestedActions });
          return;
        }
        case 'task_unblocked': {
          if (!taskId) return;
          setBlocked(taskId, null);
          return;
        }
        case 'artifact_consistency_warning': {
          const artifactId = toStr(payload['artifactId']);
          if (!artifactId) return;
          const reason =
            toStr(payload['reason']) ||
            'sha256 不一致：与上一次校验结果不同。';
          markArtifactDrifted(artifactId, reason);
          showInfo(`产物 ${artifactId} 一致性警告：${reason}`);
          return;
        }
        default:
          return;
      }
    },
    [appendTaskEvent, markArtifactDrifted, setBlocked],
  );

  // Wire a top-level SSE client mirroring ChatWindow's stream so modal/log
  // dispatch happens regardless of which child mounts first.
  const clientRef = React.useRef<ThreadSseClient | null>(null);
  React.useEffect(() => {
    if (clientRef.current) {
      clientRef.current.close();
      clientRef.current = null;
    }
    if (!activeId) return;
    const c = new ThreadSseClient({
      threadId: activeId,
      onEvent: handleEvent,
      onError: () => {
        /* DegradedBanner surfaces state via useSseStore */
      },
    });
    clientRef.current = c;
    c.start();
    return () => {
      c.close();
      if (clientRef.current === c) clientRef.current = null;
    };
  }, [activeId, handleEvent]);

  // Best-effort task count: if active thread carries activeTaskId, render 1.
  const taskCount = React.useMemo(() => {
    if (!activeId) return 0;
    const t = threads.find((x) => x.id === activeId) as
      | (Record<string, unknown> & { activeTaskId?: unknown })
      | undefined;
    if (t && typeof t.activeTaskId === 'string' && t.activeTaskId.length > 0) {
      return 1;
    }
    return 0;
  }, [activeId, threads]);

  return (
    <>
      <ToastContainer />
      <WorkbenchShell
        sidebar={<Sidebar onOpenFeishuConfig={() => setFeishuOpen(true)} />}
        header={<WorkbenchHeader taskCount={taskCount} />}
        drawer={<TaskDrawer threadId={activeId} />}
      >
        {initialDeepLink === 'policies' ? <PoliciesNotice /> : null}
        {activeId ? <ChatWindow threadId={activeId} /> : <EmptyState />}
      </WorkbenchShell>
      <CriticalNodeApprovalModal
        hit={criticalNodeHit}
        onClose={() => setCriticalNodeHit(null)}
      />
      <PlanConfirmModal
        taskId={planConfirm?.taskId ?? null}
        revisionId={planConfirm?.revisionId ?? null}
        plan={planConfirm?.plan ?? null}
        onClose={() => setPlanConfirm(null)}
      />
      <ChangeConfirmModal
        taskId={changeConfirm?.taskId ?? null}
        oldRevisionId={changeConfirm?.oldRevisionId ?? null}
        newRevisionId={changeConfirm?.newRevisionId ?? null}
        newPlan={changeConfirm?.newPlan ?? null}
        archivedArtifactCount={changeConfirm?.archivedArtifactCount}
        changeSummary={changeConfirm?.changeSummary}
        onClose={() => setChangeConfirm(null)}
      />
      <FeishuConfigSheet open={feishuOpen} onClose={() => setFeishuOpen(false)} />
      <ChannelsDrawer
        open={channelsDrawerOpen}
        onClose={() => setChannelsDrawerOpen(false)}
        threadId={activeId}
      />
    </>
  );
}

export default WorkbenchPage;
