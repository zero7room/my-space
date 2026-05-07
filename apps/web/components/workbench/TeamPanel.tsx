'use client';

import * as React from 'react';
import { cn } from '../../lib/cn';
import { api } from '../../lib/api-client';
import { showError, showSuccess } from './ToastProvider';

// ---------------------------------------------------------------------------
// Defensive types. Server contract lives in @ai-workflow/contracts but we
// keep this component tolerant of missing/renamed fields so the panel keeps
// rendering if the payload drifts.
// ---------------------------------------------------------------------------

type TeamStatus =
  | 'forming'
  | 'active'
  | 'finishing'
  | 'completed'
  | 'failed'
  | 'cancelled';

type TeammateStatus =
  | 'spawning'
  | 'idle'
  | 'working'
  | 'paused'
  | 'awaiting_critical_node'
  | 'finished'
  | 'failed'
  | 'cancelled';

type WorkItemStatus = 'available' | 'claimed' | 'completed' | 'failed' | 'cancelled';

type RosterSlotView = {
  slotId: string;
  slotName: string;
  persona?: string;
  preferredRoles?: string[];
  teammateId?: string;
  status: string;
};

type TeamView = {
  id: string;
  parentTaskId?: string;
  status: TeamStatus | string;
  roster: RosterSlotView[];
  budget?: unknown;
  startedAt?: string;
  finishedAt?: string;
  summary?: unknown;
};

type WorkItemView = {
  id: string;
  status: WorkItemStatus | string;
  description?: string;
  preferredRole?: string;
  priority?: number;
  claimedByTeammateId?: string;
  claimLeaseExpireAt?: string;
  claimFencingToken?: number;
  attemptCount?: number;
};

type MessageFromTo = 'lead' | 'broadcast' | string | { teammateId?: string };

type TeamMessageView = {
  id: string;
  from: MessageFromTo;
  to: MessageFromTo;
  kind: 'chat' | 'handoff' | 'directive' | 'status' | 'result_link' | string;
  content: string;
  at: string;
};

type TeammateView = {
  id: string;
  slotId: string;
  persona?: string;
  status: TeammateStatus | string;
  currentWorkItemId?: string;
  lastMessageAt?: string;
  budget?: unknown;
  summary?: unknown;
};

// ---------------------------------------------------------------------------

function shortId(id: string | undefined): string {
  if (!id) return '';
  if (id.length <= 8) return id;
  return id.slice(0, 8);
}

function formatTime(iso: string | undefined): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '';
  }
}

function endpointLabel(v: MessageFromTo): string {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && typeof v.teammateId === 'string') {
    return `mate:${shortId(v.teammateId)}`;
  }
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Colored pill helpers
// ---------------------------------------------------------------------------

function teamStatusPill(status: string): React.JSX.Element {
  const map: Record<string, string> = {
    forming: 'bg-accent-soft text-accent',
    active: 'bg-success/15 text-success',
    finishing: 'bg-warning/15 text-warning',
    completed: 'bg-success/15 text-success',
    failed: 'bg-danger/15 text-danger',
    cancelled: 'bg-surface-strong text-muted',
  };
  return (
    <span
      className={cn(
        'rounded-pill px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
        map[status] ?? 'bg-surface-strong text-muted',
      )}
    >
      {status}
    </span>
  );
}

function teammateStatusPill(status: string): React.JSX.Element {
  const map: Record<string, string> = {
    spawning: 'bg-accent-soft text-accent',
    idle: 'bg-surface-strong text-muted',
    working: 'bg-success/15 text-success',
    paused: 'bg-warning/15 text-warning',
    awaiting_critical_node: 'bg-warning/20 text-warning',
    finished: 'bg-success/15 text-success',
    failed: 'bg-danger/15 text-danger',
    cancelled: 'bg-surface-strong text-muted',
  };
  return (
    <span
      className={cn(
        'rounded-pill px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
        map[status] ?? 'bg-surface-strong text-muted',
      )}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function workItemStatusAccent(status: string): string {
  switch (status) {
    case 'available':
      return 'border-l-muted';
    case 'claimed':
      return 'border-l-accent';
    case 'completed':
      return 'border-l-success';
    case 'failed':
      return 'border-l-danger';
    case 'cancelled':
      return 'border-l-muted';
    default:
      return 'border-l-muted';
  }
}

function messageKindPill(kind: string): React.JSX.Element {
  const map: Record<string, string> = {
    chat: 'bg-surface-strong text-muted',
    handoff: 'bg-accent-soft text-accent',
    directive: 'bg-warning/15 text-warning',
    status: 'bg-success/15 text-success',
    result_link: 'bg-accent-soft text-accent',
  };
  return (
    <span
      className={cn(
        'rounded-pill px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
        map[kind] ?? 'bg-surface-strong text-muted',
      )}
    >
      {kind}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Hooks — polling
// ---------------------------------------------------------------------------

function usePoll<T>(
  fn: () => Promise<T>,
  intervalMs: number,
  deps: ReadonlyArray<unknown>,
): { data: T | null; err: string | null; reload: () => void } {
  const [data, setData] = React.useState<T | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [nonce, setNonce] = React.useState(0);

  const run = React.useCallback(async () => {
    try {
      const v = await fn();
      setData(v);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  React.useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const v = await fn();
        if (!cancelled) {
          setData(v);
          setErr(null);
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      }
    };
    void tick();
    const t = setInterval(() => void tick(), intervalMs);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce, intervalMs]);

  return {
    data,
    err,
    reload: () => {
      setNonce((n) => n + 1);
      void run();
    },
  };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function WorkbenchTeamPanel(props: { taskId: string }): React.JSX.Element {
  const { taskId } = props;
  const [selectedTeamId, setSelectedTeamId] = React.useState<string | null>(null);

  // Teams list — refresh every 10s (roster changes slowly)
  const teamsPoll = usePoll(
    () => api.listTeams(taskId),
    10000,
    [taskId],
  );

  const teams = React.useMemo<TeamView[]>(() => {
    const raw = (teamsPoll.data as { teams?: unknown } | null)?.teams;
    return Array.isArray(raw) ? (raw as TeamView[]) : [];
  }, [teamsPoll.data]);

  // auto-select first team
  React.useEffect(() => {
    if (!selectedTeamId && teams.length > 0) {
      setSelectedTeamId(teams[0]!.id);
    }
    // if current selection is gone, fall back to first
    if (selectedTeamId && !teams.find((t) => t.id === selectedTeamId) && teams.length > 0) {
      setSelectedTeamId(teams[0]!.id);
    }
  }, [teams, selectedTeamId]);

  const team = teams.find((t) => t.id === selectedTeamId) ?? null;

  if (teamsPoll.err && teams.length === 0) {
    return (
      <section className="rounded-panel border border-border bg-surface p-6 text-sm text-muted">
        teams: {teamsPoll.err}
      </section>
    );
  }

  if (teams.length === 0) {
    return (
      <section className="rounded-panel border border-border bg-surface p-6 text-sm text-muted">
        当前任务暂无子团队。
      </section>
    );
  }

  return (
    <section className="flex min-h-0 flex-col gap-4">
      {/* Team selector row + top-right actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="u-label">Teams</span>
          {teams.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedTeamId(t.id)}
              className={cn(
                'inline-flex items-center gap-2 rounded-pill border px-3 py-1 text-xs transition-colors',
                t.id === selectedTeamId
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-border bg-surface text-foreground hover:bg-surface-strong',
              )}
            >
              <code className="font-mono text-[11px]">{shortId(t.id)}</code>
              {teamStatusPill(t.status)}
            </button>
          ))}
        </div>
        {team ? <TeamActions taskId={taskId} team={team} /> : null}
      </div>

      {team ? (
        <TeamBody key={team.id} taskId={taskId} team={team} />
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Per-team body
// ---------------------------------------------------------------------------

function TeamBody(props: { taskId: string; team: TeamView }): React.JSX.Element {
  const { taskId, team } = props;

  const workItemsPoll = usePoll(
    () => api.teamWorkItems(taskId, team.id),
    3000,
    [taskId, team.id],
  );

  const messagesPoll = usePoll(
    () => api.teamMessages(taskId, team.id),
    3000,
    [taskId, team.id],
  );

  const mateysPoll = usePoll(
    () => api.teammates(taskId, team.id),
    5000,
    [taskId, team.id],
  );

  const workItems = React.useMemo<WorkItemView[]>(() => {
    const raw = (workItemsPoll.data as { workItems?: unknown } | null)?.workItems;
    return Array.isArray(raw) ? (raw as WorkItemView[]) : [];
  }, [workItemsPoll.data]);

  const messages = React.useMemo<TeamMessageView[]>(() => {
    const raw = (messagesPoll.data as { messages?: unknown } | null)?.messages;
    return Array.isArray(raw) ? (raw as TeamMessageView[]) : [];
  }, [messagesPoll.data]);

  const teammates = React.useMemo<TeammateView[]>(() => {
    const raw = (mateysPoll.data as { teammates?: unknown } | null)?.teammates;
    return Array.isArray(raw) ? (raw as TeammateView[]) : [];
  }, [mateysPoll.data]);

  // selected teammate (drawer)
  const [selectedMateId, setSelectedMateId] = React.useState<string | null>(null);

  const openMate = React.useCallback((id: string | undefined) => {
    if (id) setSelectedMateId(id);
  }, []);
  const closeMate = React.useCallback(() => setSelectedMateId(null), []);

  const selectedMate = teammates.find((m) => m.id === selectedMateId) ?? null;

  return (
    <div className="relative flex min-h-0 flex-col gap-4">
      {/* Section 1 — Roster grid */}
      <RosterGrid
        taskId={taskId}
        teamId={team.id}
        roster={team.roster}
        teammates={teammates}
        onOpenMate={openMate}
      />

      {/* Section 2 — Work item segments */}
      <WorkItemSegments workItems={workItems} err={workItemsPoll.err} />

      {/* Section 3 — Message bus feed */}
      <MessageBusFeed messages={messages} err={messagesPoll.err} />

      {/* Section 4 — Per-teammate events drawer (overlay on the panel area) */}
      {selectedMate ? (
        <TeammateEventsDrawer
          taskId={taskId}
          teamId={team.id}
          teammate={selectedMate}
          onClose={closeMate}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 1 — Roster grid
// ---------------------------------------------------------------------------

function RosterGrid(props: {
  taskId: string;
  teamId: string;
  roster: RosterSlotView[];
  teammates: TeammateView[];
  onOpenMate: (id: string | undefined) => void;
}): React.JSX.Element {
  const { taskId, teamId, roster, teammates, onOpenMate } = props;

  // Build an index by slotId → teammate for richer slot cards.
  const matesBySlot = new Map<string, TeammateView>();
  for (const m of teammates) matesBySlot.set(m.slotId, m);

  const [busy, setBusy] = React.useState<string | null>(null);

  const approve = async (teammateId: string) => {
    setBusy(teammateId);
    try {
      await api.approveTeammate(taskId, teamId, teammateId);
      showSuccess('已批准关键节点');
    } catch (e) {
      showError(e);
    } finally {
      setBusy(null);
    }
  };

  const reject = async (teammateId: string) => {
    setBusy(teammateId);
    try {
      await api.rejectTeammate(taskId, teamId, teammateId);
      showSuccess('已拒绝关键节点');
    } catch (e) {
      showError(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-panel border border-border bg-surface p-4 shadow-soft">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="u-label">Roster</h3>
        <span className="text-[11px] text-muted">{roster.length} slot(s)</span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {roster.map((slot) => {
          const mate = slot.teammateId
            ? teammates.find((m) => m.id === slot.teammateId)
            : matesBySlot.get(slot.slotId);
          const displayStatus = mate?.status ?? slot.status;
          const isAwaiting = displayStatus === 'awaiting_critical_node';
          const teammateId = mate?.id ?? slot.teammateId;
          return (
            <div
              key={slot.slotId}
              className={cn(
                'flex flex-col gap-2 rounded-card border border-border bg-surface-raised p-3 text-sm shadow-soft transition-colors',
                teammateId ? 'cursor-pointer hover:border-accent/60' : 'opacity-80',
              )}
              onClick={() => teammateId && onOpenMate(teammateId)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-medium text-foreground">
                    {slot.persona ?? slot.slotName ?? slot.slotId}
                  </div>
                  {teammateId ? (
                    <div className="truncate text-[11px] text-muted">
                      mate:{shortId(teammateId)}
                    </div>
                  ) : (
                    <div className="text-[11px] text-muted">slot:{shortId(slot.slotId)}</div>
                  )}
                </div>
                {teammateStatusPill(displayStatus)}
              </div>
              {mate?.currentWorkItemId && displayStatus === 'working' ? (
                <div className="text-[11px] text-muted">
                  working on{' '}
                  <code className="font-mono">{shortId(mate.currentWorkItemId)}</code>
                </div>
              ) : null}
              {isAwaiting && teammateId ? (
                <div
                  className="flex gap-2 pt-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    disabled={busy === teammateId}
                    onClick={() => void approve(teammateId)}
                    className="rounded-pill bg-success px-3 py-1 text-[11px] font-semibold text-white shadow-soft hover:opacity-90 disabled:opacity-60"
                  >
                    批准
                  </button>
                  <button
                    type="button"
                    disabled={busy === teammateId}
                    onClick={() => void reject(teammateId)}
                    className="rounded-pill border border-danger px-3 py-1 text-[11px] font-semibold text-danger hover:bg-danger/10 disabled:opacity-60"
                  >
                    拒绝
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 2 — Work item segments (4 columns)
// ---------------------------------------------------------------------------

const WI_SEGMENTS: Array<{
  key: WorkItemStatus;
  label: string;
  title: string;
}> = [
  { key: 'available', label: 'Available', title: '待认领' },
  { key: 'claimed', label: 'Claimed', title: '认领中' },
  { key: 'completed', label: 'Completed', title: '已完成' },
  { key: 'failed', label: 'Failed', title: '失败' },
];

function WorkItemSegments(props: {
  workItems: WorkItemView[];
  err: string | null;
}): React.JSX.Element {
  const { workItems, err } = props;
  const byStatus = new Map<string, WorkItemView[]>();
  for (const w of workItems) {
    const arr = byStatus.get(w.status) ?? [];
    arr.push(w);
    byStatus.set(w.status, arr);
  }
  return (
    <div className="rounded-panel border border-border bg-surface p-4 shadow-soft">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="u-label">Work Items</h3>
        <span className="text-[11px] text-muted">
          {err ? `错误：${err}` : '实时刷新中 · 3s'}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {WI_SEGMENTS.map((seg) => {
          const items = byStatus.get(seg.key) ?? [];
          return (
            <div
              key={seg.key}
              className="flex min-h-[10rem] flex-col rounded-card border border-border bg-surface-raised"
            >
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{seg.label}</span>
                  <span className="text-[10px] text-muted">{seg.title}</span>
                </div>
                <span className="rounded-pill bg-surface-strong px-2 py-0.5 text-[10px] font-semibold text-muted">
                  {items.length}
                </span>
              </div>
              <div className="flex max-h-72 flex-col gap-2 overflow-y-auto p-3">
                {items.length === 0 ? (
                  <div className="py-6 text-center text-[11px] text-muted">—</div>
                ) : (
                  items.map((w) => <WorkItemCard key={w.id} item={w} />)
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WorkItemCard(props: { item: WorkItemView }): React.JSX.Element {
  const { item } = props;
  return (
    <div
      className={cn(
        'rounded-card border border-border border-l-4 bg-surface p-2 text-xs shadow-soft',
        workItemStatusAccent(item.status),
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <code className="font-mono text-[10px] text-muted">{shortId(item.id)}</code>
        {typeof item.priority === 'number' ? (
          <span className="rounded-pill bg-surface-strong px-1.5 py-0.5 text-[9px] text-muted">
            p{item.priority}
          </span>
        ) : null}
      </div>
      {item.preferredRole ? (
        <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-accent">
          {item.preferredRole}
        </div>
      ) : null}
      {item.description ? (
        <div className="mt-1 line-clamp-2 text-[12px] leading-5 text-foreground">
          {item.description}
        </div>
      ) : null}
      {item.claimedByTeammateId ? (
        <div className="mt-1 text-[10px] text-muted">
          by <code className="font-mono">{shortId(item.claimedByTeammateId)}</code>
          {typeof item.attemptCount === 'number' && item.attemptCount > 0 ? (
            <span className="ml-2">attempts={item.attemptCount}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 3 — Message bus feed
// ---------------------------------------------------------------------------

type MsgFilter =
  | 'all'
  | 'from:lead'
  | 'to:broadcast'
  | 'kind:chat'
  | 'kind:handoff'
  | 'kind:directive'
  | 'kind:status'
  | 'kind:result_link';

const MSG_FILTERS: Array<{ key: MsgFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'from:lead', label: 'from:lead' },
  { key: 'to:broadcast', label: 'to:broadcast' },
  { key: 'kind:chat', label: 'kind:chat' },
  { key: 'kind:handoff', label: 'kind:handoff' },
  { key: 'kind:directive', label: 'kind:directive' },
  { key: 'kind:status', label: 'kind:status' },
  { key: 'kind:result_link', label: 'kind:result_link' },
];

function MessageBusFeed(props: {
  messages: TeamMessageView[];
  err: string | null;
}): React.JSX.Element {
  const { messages, err } = props;
  const [filter, setFilter] = React.useState<MsgFilter>('all');
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});

  const filtered = React.useMemo(() => {
    if (filter === 'all') return messages;
    if (filter === 'from:lead') return messages.filter((m) => m.from === 'lead');
    if (filter === 'to:broadcast') return messages.filter((m) => m.to === 'broadcast');
    const kind = filter.slice('kind:'.length);
    return messages.filter((m) => m.kind === kind);
  }, [filter, messages]);

  // Auto-scroll to bottom on new messages
  const lastSigRef = React.useRef<string>('');
  React.useEffect(() => {
    const last = filtered[filtered.length - 1];
    const sig = last ? `${last.id}:${filtered.length}` : `${filtered.length}`;
    if (sig !== lastSigRef.current) {
      lastSigRef.current = sig;
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [filtered]);

  return (
    <div className="rounded-panel border border-border bg-surface p-4 shadow-soft">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="u-label">Message Bus</h3>
        <span className="text-[11px] text-muted">
          {err ? `错误：${err}` : `${filtered.length} / ${messages.length}`}
        </span>
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {MSG_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              'rounded-pill border px-2.5 py-0.5 text-[11px] transition-colors',
              filter === f.key
                ? 'border-accent bg-accent-soft text-accent'
                : 'border-border bg-surface text-muted hover:bg-surface-strong',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div
        ref={scrollRef}
        className="flex max-h-80 flex-col gap-2 overflow-y-auto rounded-card bg-surface-raised p-3"
      >
        {filtered.length === 0 ? (
          <div className="py-6 text-center text-[11px] text-muted">无消息</div>
        ) : (
          filtered.map((m) => {
            const isExpanded = expanded[m.id] === true;
            const long = m.content.length > 200;
            const text = isExpanded || !long ? m.content : m.content.slice(0, 200) + '…';
            return (
              <div
                key={m.id}
                className="rounded-card border border-border bg-surface p-2 text-xs shadow-soft"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[10px] text-muted">
                    {endpointLabel(m.from)} → {endpointLabel(m.to)}
                  </span>
                  {messageKindPill(m.kind)}
                  <span className="ml-auto text-[10px] text-muted">{formatTime(m.at)}</span>
                </div>
                <div className="mt-1 whitespace-pre-wrap break-words text-[12px] leading-5 text-foreground">
                  {text}
                </div>
                {long ? (
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded((prev) => ({ ...prev, [m.id]: !isExpanded }))
                    }
                    className="mt-1 text-[10px] text-accent hover:underline"
                  >
                    {isExpanded ? '折叠' : '展开'}
                  </button>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 4 — Per-teammate events drawer
// ---------------------------------------------------------------------------

function parseEventsPayload(raw: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(raw)) {
    return raw.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object');
  }
  if (typeof raw === 'string') {
    // Try NDJSON first
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const out: Array<Record<string, unknown>> = [];
    for (const line of lines) {
      try {
        const v = JSON.parse(line);
        if (v && typeof v === 'object' && !Array.isArray(v)) out.push(v as Record<string, unknown>);
      } catch {
        // skip
      }
    }
    if (out.length > 0) return out;
    // fallback: try JSON array
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (x): x is Record<string, unknown> => !!x && typeof x === 'object',
        );
      }
    } catch {
      // noop
    }
    return [];
  }
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>;
    if (Array.isArray(r['events'])) {
      return (r['events'] as unknown[]).filter(
        (x): x is Record<string, unknown> => !!x && typeof x === 'object',
      );
    }
  }
  return [];
}

function kindAccent(kind: string | undefined): string {
  switch (kind) {
    case 'error':
    case 'failed':
    case 'team_work_item_failed':
      return 'border-l-danger';
    case 'warn':
    case 'warning':
    case 'awaiting_critical_node':
      return 'border-l-warning';
    case 'success':
    case 'completed':
    case 'team_work_item_completed':
      return 'border-l-success';
    case 'info':
    case 'status':
      return 'border-l-accent';
    default:
      return 'border-l-muted';
  }
}

function TeammateEventsDrawer(props: {
  taskId: string;
  teamId: string;
  teammate: TeammateView;
  onClose: () => void;
}): React.JSX.Element {
  const { taskId, teamId, teammate, onClose } = props;
  const [events, setEvents] = React.useState<Array<Record<string, unknown>>>([]);
  const [err, setErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [openIdx, setOpenIdx] = React.useState<Record<number, boolean>>({});

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .teammateEvents(taskId, teamId, teammate.id)
      .then((raw) => {
        if (cancelled) return;
        setEvents(parseEventsPayload(raw));
        setErr(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setErr(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [taskId, teamId, teammate.id]);

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex justify-end">
      <div
        className="pointer-events-auto absolute inset-0 bg-black/10 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <aside
        className="pointer-events-auto relative flex h-full w-full max-w-md flex-col overflow-hidden border-l border-border bg-surface shadow-[var(--shadow-drawer)]"
        role="dialog"
        aria-label="Teammate events"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <div className="u-label">Teammate</div>
            <div className="mt-1 truncate font-mono text-sm text-foreground">
              {teammate.id}
            </div>
            <div className="mt-1 flex items-center gap-2">
              {teammateStatusPill(teammate.status)}
              {teammate.persona ? (
                <span className="text-[11px] text-muted">{teammate.persona}</span>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-pill border border-border px-3 py-1 text-xs text-muted hover:bg-surface-strong"
          >
            关闭
          </button>
        </header>
        <div className="border-b border-border bg-surface-raised p-3 text-[11px] text-muted">
          <div>
            slot:{' '}
            <code className="font-mono text-foreground">{shortId(teammate.slotId)}</code>
          </div>
          {teammate.currentWorkItemId ? (
            <div>
              current:{' '}
              <code className="font-mono text-foreground">
                {shortId(teammate.currentWorkItemId)}
              </code>
            </div>
          ) : null}
          {teammate.budget ? (
            <details className="mt-1">
              <summary className="cursor-pointer">budget</summary>
              <pre className="mt-1 max-h-28 overflow-auto rounded bg-surface p-2 text-[10px] leading-4 text-foreground">
                {JSON.stringify(teammate.budget, null, 2)}
              </pre>
            </details>
          ) : null}
          {teammate.summary ? (
            <details className="mt-1">
              <summary className="cursor-pointer">summary</summary>
              <pre className="mt-1 max-h-28 overflow-auto rounded bg-surface p-2 text-[10px] leading-4 text-foreground">
                {typeof teammate.summary === 'string'
                  ? teammate.summary
                  : JSON.stringify(teammate.summary, null, 2)}
              </pre>
            </details>
          ) : null}
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
          {loading ? (
            <div className="py-6 text-center text-xs text-muted">加载中…</div>
          ) : err ? (
            <div className="py-6 text-center text-xs text-danger">events: {err}</div>
          ) : events.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted">暂无事件</div>
          ) : (
            events.map((ev, i) => {
              const kind =
                typeof ev['kind'] === 'string'
                  ? (ev['kind'] as string)
                  : typeof ev['type'] === 'string'
                    ? (ev['type'] as string)
                    : '';
              const at =
                typeof ev['at'] === 'string'
                  ? (ev['at'] as string)
                  : typeof ev['ts'] === 'string'
                    ? (ev['ts'] as string)
                    : '';
              const open = openIdx[i] === true;
              return (
                <div
                  key={i}
                  className={cn(
                    'rounded-card border border-border border-l-4 bg-surface-raised p-2 text-xs shadow-soft',
                    kindAccent(kind),
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setOpenIdx((p) => ({ ...p, [i]: !open }))}
                    className="flex w-full items-center justify-between gap-2 text-left"
                  >
                    <span className="font-mono text-[11px] text-foreground">
                      {kind || '(event)'}
                    </span>
                    <span className="text-[10px] text-muted">{formatTime(at)}</span>
                  </button>
                  {open ? (
                    <pre className="mt-2 max-h-48 overflow-auto rounded bg-surface p-2 text-[10px] leading-4 text-foreground">
                      {JSON.stringify(ev, null, 2)}
                    </pre>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top-right team action buttons (terminate + recovery log)
// ---------------------------------------------------------------------------

const TERMINABLE: ReadonlySet<string> = new Set(['forming', 'active', 'finishing']);

function TeamActions(props: { taskId: string; team: TeamView }): React.JSX.Element {
  const { taskId, team } = props;
  const [busy, setBusy] = React.useState(false);
  const [logOpen, setLogOpen] = React.useState(false);
  const [logBody, setLogBody] = React.useState<string | null>(null);
  const [logErr, setLogErr] = React.useState<string | null>(null);

  const canTerminate = TERMINABLE.has(team.status);

  const terminate = async () => {
    if (!canTerminate) return;
    const ok = typeof window !== 'undefined' ? window.confirm('确认终止该 team 吗？此操作不可撤销。') : true;
    if (!ok) return;
    setBusy(true);
    try {
      await api.cancelTeam(taskId, team.id);
      showSuccess('已终止 team');
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };

  const loadLog = async () => {
    setLogOpen((v) => !v);
    if (logBody !== null) return;
    try {
      const raw = await api.recoveryLog(taskId, team.id);
      setLogBody(typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2));
      setLogErr(null);
    } catch (e) {
      setLogErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={loadLog}
          className="text-[11px] text-accent hover:underline"
        >
          {logOpen ? '隐藏恢复日志' : '恢复日志'}
        </button>
        {canTerminate ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void terminate()}
            className="rounded-pill border border-danger px-3 py-1 text-xs font-semibold text-danger hover:bg-danger/10 disabled:opacity-60"
          >
            终止 team
          </button>
        ) : null}
      </div>
      {logOpen ? (
        <div className="w-full max-w-lg rounded-card border border-border bg-surface-raised p-3 text-xs shadow-soft">
          {logErr ? (
            <div className="text-danger">recovery: {logErr}</div>
          ) : logBody === null ? (
            <div className="text-muted">加载中…</div>
          ) : (
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words text-[10px] leading-4 text-foreground">
              {logBody}
            </pre>
          )}
        </div>
      ) : null}
    </div>
  );
}
