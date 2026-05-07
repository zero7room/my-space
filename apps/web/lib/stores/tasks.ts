import { create } from 'zustand';

export type BlockedInfo = {
  taskId: string;
  blockedReason: string;
  suggestedActions: string[];
};

type State = {
  // per-task blocked state derived from task_blocked SSE events
  blocked: Record<string, BlockedInfo>;
  // selected task id for TaskDrawer detail view
  selectedId: string | null;
  drawerOpen: boolean;
  detailTab: 'summary' | 'plan' | 'changes' | 'log' | 'team' | 'artifact';
  // artifact drift map populated from artifact_consistency_warning events
  driftedArtifacts: Record<string, string>; // artifactId → reason
  setBlocked: (taskId: string, info: BlockedInfo | null) => void;
  setSelected: (id: string | null) => void;
  setDrawerOpen: (b: boolean) => void;
  setDetailTab: (t: State['detailTab']) => void;
  markArtifactDrifted: (id: string, reason: string) => void;
  clearArtifactDrift: (id: string) => void;
};

export const useTasksStore = create<State>((set) => ({
  blocked: {},
  selectedId: null,
  drawerOpen: false,
  detailTab: 'summary',
  driftedArtifacts: {},
  setBlocked: (taskId, info) =>
    set((s) => {
      const next = { ...s.blocked };
      if (info) next[taskId] = info;
      else delete next[taskId];
      return { blocked: next };
    }),
  setSelected: (selectedId) => set({ selectedId }),
  setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
  setDetailTab: (detailTab) => set({ detailTab }),
  markArtifactDrifted: (id, reason) =>
    set((s) => ({ driftedArtifacts: { ...s.driftedArtifacts, [id]: reason } })),
  clearArtifactDrift: (id) =>
    set((s) => {
      const next = { ...s.driftedArtifacts };
      delete next[id];
      return { driftedArtifacts: next };
    }),
}));
