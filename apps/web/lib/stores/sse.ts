import { create } from 'zustand';
import type { GuardDecision } from '../../components/workbench/GuardDecisionBadge';

export type TaskEvent = {
  id: string | number;
  kind: string;
  at?: string;
  payload?: unknown;
  seq?: number;
};

export type ChatMessageRecord = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  at: string;
  guardDecision?: GuardDecision;
};

type State = {
  degraded: boolean;
  replaying: boolean;
  replayFrom: number | null;
  replayTo: number | null;
  lastEventId: number | null;
  reloadRequired: boolean;
  taskEvents: Record<string, TaskEvent[]>;
  messagesByThread: Record<string, ChatMessageRecord[]>;
  setDegraded: (b: boolean) => void;
  setReplay: (from: number | null, to: number | null) => void;
  setLastEventId: (id: number) => void;
  setReloadRequired: (b: boolean) => void;
  appendTaskEvent: (taskId: string, e: TaskEvent) => void;
  clearTaskEvents: (taskId: string) => void;
  appendMessage: (threadId: string, m: ChatMessageRecord) => void;
  attachGuardDecisionToLastUser: (
    threadId: string,
    decision: GuardDecision,
  ) => void;
  resetMessages: (threadId: string) => void;
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
  messagesByThread: {},
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
  appendMessage: (threadId, m) =>
    set((s) => {
      const list = s.messagesByThread[threadId] ?? [];
      // Dedupe by id
      if (list.some((x) => x.id === m.id)) return {} as Partial<State>;
      const next = [...list, m];
      if (next.length > 1000) next.splice(0, next.length - 1000);
      return { messagesByThread: { ...s.messagesByThread, [threadId]: next } };
    }),
  attachGuardDecisionToLastUser: (threadId, decision) =>
    set((s) => {
      const list = s.messagesByThread[threadId];
      if (!list || list.length === 0) return {} as Partial<State>;
      const next = list.slice();
      for (let i = next.length - 1; i >= 0; i -= 1) {
        if (next[i].role === 'user') {
          next[i] = { ...next[i], guardDecision: decision };
          return {
            messagesByThread: { ...s.messagesByThread, [threadId]: next },
          };
        }
      }
      return {} as Partial<State>;
    }),
  resetMessages: (threadId) =>
    set((s) => {
      const next = { ...s.messagesByThread };
      next[threadId] = [];
      return { messagesByThread: next };
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
      messagesByThread: {},
    }),
}));
