import { create } from 'zustand';

type State = {
  degraded: boolean;
  replaying: boolean;
  replayFrom: number | null;
  replayTo: number | null;
  lastEventId: number | null;
  reloadRequired: boolean;
  setDegraded: (b: boolean) => void;
  setReplay: (from: number | null, to: number | null) => void;
  setLastEventId: (id: number) => void;
  setReloadRequired: (b: boolean) => void;
  reset: () => void;
};

export const useSseStore = create<State>((set) => ({
  degraded: false,
  replaying: false,
  replayFrom: null,
  replayTo: null,
  lastEventId: null,
  reloadRequired: false,
  setDegraded: (degraded) => set({ degraded }),
  setReplay: (replayFrom, replayTo) =>
    set({ replaying: replayFrom !== null, replayFrom, replayTo }),
  setLastEventId: (lastEventId) => set({ lastEventId }),
  setReloadRequired: (reloadRequired) => set({ reloadRequired }),
  reset: () =>
    set({
      degraded: false,
      replaying: false,
      replayFrom: null,
      replayTo: null,
      lastEventId: null,
      reloadRequired: false,
    }),
}));
