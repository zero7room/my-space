'use client';
import * as React from 'react';
import { create } from 'zustand';

type Toast = { id: string; kind: 'info' | 'success' | 'warning' | 'danger'; text: string };
type State = {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id'>) => void;
  dismiss: (id: string) => void;
};
export const useToastStore = create<State>((set) => ({
  toasts: [],
  push: (t) => {
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), 5000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

export function ToastContainer(): React.JSX.Element {
  const { toasts, dismiss } = useToastStore();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto rounded-pill px-4 py-2 text-sm shadow-medium backdrop-blur ${
            t.kind === 'danger'
              ? 'bg-danger text-white'
              : t.kind === 'success'
                ? 'bg-success text-white'
                : t.kind === 'warning'
                  ? 'bg-warning text-white'
                  : 'bg-surface-raised text-foreground'
          }`}
          onClick={() => dismiss(t.id)}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function showError(err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  let text = msg;
  if (msg.includes('403')) text = '权限拒绝：仅任务发起人可操作';
  else if (msg.includes('409')) text = '当前状态不允许此操作';
  useToastStore.getState().push({ kind: 'danger', text });
}

export function showInfo(text: string): void {
  useToastStore.getState().push({ kind: 'info', text });
}

export function showSuccess(text: string): void {
  useToastStore.getState().push({ kind: 'success', text });
}
