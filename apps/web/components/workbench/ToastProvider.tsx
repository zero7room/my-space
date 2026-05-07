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

const REASON_MAP: Record<string, string> = {
  not_owner: '权限拒绝：仅任务发起人可操作',
  invalid_state: '当前任务状态不允许此操作',
  terminal_state: '任务已是终态，无法再变更',
  cursor_too_old: '事件游标过旧，请刷新',
  duplicate_request: '请求被去重',
};

export function showError(err: unknown): void {
  let text: string;
  // Lazy duck-typed read to avoid an import cycle with api-client.
  const e = err as { status?: number; reason?: string; message?: string } | null;
  if (e && typeof e.status === 'number' && e.reason && REASON_MAP[e.reason]) {
    text = REASON_MAP[e.reason];
  } else if (e && e.status === 403) {
    text = '权限拒绝（403）';
  } else if (e && e.status === 409) {
    text = '当前状态不允许此操作（409）';
  } else if (e && typeof e.message === 'string' && e.message.length > 0) {
    text = e.message;
  } else {
    text = String(err);
  }
  useToastStore.getState().push({ kind: 'danger', text });
}

export function showInfo(text: string): void {
  useToastStore.getState().push({ kind: 'info', text });
}

export function showSuccess(text: string): void {
  useToastStore.getState().push({ kind: 'success', text });
}
