import { create } from 'zustand';
import type { ThreadDto } from '@ai-workflow/contracts';

type State = {
  threads: ThreadDto[];
  activeId: string | null;
  loading: boolean;
  setThreads: (t: ThreadDto[]) => void;
  setActive: (id: string | null) => void;
  upsertThread: (t: ThreadDto) => void;
  removeThread: (id: string) => void;
  setLoading: (b: boolean) => void;
};

export const useConversationsStore = create<State>((set) => ({
  threads: [],
  activeId: null,
  loading: false,
  setThreads: (threads) => set({ threads }),
  setActive: (activeId) => set({ activeId }),
  upsertThread: (t) =>
    set((s) => {
      const next = s.threads.filter((x) => x.id !== t.id);
      return { threads: [t, ...next] };
    }),
  removeThread: (id) =>
    set((s) => ({
      threads: s.threads.filter((x) => x.id !== id),
      activeId: s.activeId === id ? null : s.activeId,
    })),
  setLoading: (loading) => set({ loading }),
}));
