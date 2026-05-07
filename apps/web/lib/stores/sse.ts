import { create } from 'zustand';

export type TaskEvent = {
  id: string | number;
  kind: string;
  at?: string;
  payload?: unknown;
  seq?: number;
};

type State = {
  degraded: boolean;
  replaying: boolean;
  replayFrom: number | null;
  replayTo: number | null;
  lastEventId: number | null;
  reloadRequired: boolean;
  taskEvents: Record<string, TaskEvent[]>;
  setDegraded: (b: boolean) => void;
  setReplay: (from: number | null, to: number | null) => void;
  setLastEventId: (id: number) => void;
  setReloadRequired: (b: boolean) => void;
  appendTaskEvent: (taskId: string, e: TaskEvent) => void;
  clearTaskEvents: (taskId: string) => void;
  reset: () => void;
};

export const useSseStore = create<State>((set) => ({
  degraded: false,
  replaying: false,
  replayFrom: null,
  replayTo: null,
  lastEventId: null,
  reloadRequired: false,
  taskEvents: {},
  setDegraded: (degraded) => set({ degraded }),
  setReplay: (replayFrom, replayTo) =>
    set({ replaying: replayFrom !== null, replayFrom, replayTo }),
  setLastEventId: (lastEventId) => set({ lastEventId }),
  setReloadRequired: (reloadRequired) => set({ reloadRequired }),
  appendTaskEvent: (taskId, e) =>
    set((s) => {
      const list = s.taskEvents[taskId] ?? [];
      const next = [...list, e];
      // cap per task 500 to avoid unbounded memory
      if (next.length > 500) next.splice(0, next.length - 500);
      return { taskEvents: { ...s.taskEvents, [taskId]: next } };
    }),
  clearTaskEvents: (taskId) =>
    set((s) => {
      const next = { ...s.taskEvents };
      delete next[taskId];
      return { taskEvents: next };
    }),
  reset: () =>
    set({
      degraded: false,
      replaying: false,
      replayFrom: null,
      replayTo: null,
      lastEventId: null,
      reloadRequired: false,
      taskEvents: {},
    }),
}));
