'use client';
import * as React from 'react';
import { cn } from '../../lib/cn';
import { api } from '../../lib/api-client';
import { useSseStore } from '../../lib/stores/sse';
import { MessageBubble, type ChatMessage } from './MessageBubble';

export function ChatWindow(props: {
  threadId: string | null;
}): React.JSX.Element {
  const { threadId } = props;
  const [input, setInput] = React.useState('');
  const [sending, setSending] = React.useState(false);

  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const taRef = React.useRef<HTMLTextAreaElement | null>(null);

  const reloadRequired = useSseStore((s) => s.reloadRequired);
  const setReloadRequired = useSseStore((s) => s.setReloadRequired);
  const messagesByThread = useSseStore((s) => s.messagesByThread);
  const appendMessage = useSseStore((s) => s.appendMessage);
  const resetMessages = useSseStore((s) => s.resetMessages);

  const messages: ChatMessage[] = React.useMemo(() => {
    if (!threadId) return [];
    const list = messagesByThread[threadId] ?? [];
    return list.map(
      (m): ChatMessage => ({
        id: m.id,
        role: m.role,
        text: m.text,
        at: m.at,
        guardDecision: m.guardDecision,
      }),
    );
  }, [messagesByThread, threadId]);

  // Reload-required: clear messages for this thread and let the parent
  // WorkbenchPage's SSE client repopulate.
  React.useEffect(() => {
    if (!reloadRequired) return;
    if (threadId) resetMessages(threadId);
    setReloadRequired(false);
  }, [reloadRequired, threadId, resetMessages, setReloadRequired]);

  // Scroll to bottom on new message
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Auto-grow textarea (1..6 rows)
  React.useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const lineHeight = 24;
    const maxHeight = lineHeight * 6 + 16;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [input]);

  const send = React.useCallback(async () => {
    const text = input.trim();
    if (!text || !threadId || sending) return;
    setSending(true);
    const optimisticId = `local-${Date.now()}`;
    const at = new Date().toISOString();
    appendMessage(threadId, { id: optimisticId, role: 'user', text, at });
    setInput('');
    try {
      await api.postMessage(threadId, text);
    } catch {
      // Optimistic bubble stays for now; the SSE replay should reconcile.
    } finally {
      setSending(false);
    }
  }, [input, threadId, sending, appendMessage]);

  const stop = React.useCallback(() => {
    setSending(false);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const canSend = !!input.trim() && !sending && !!threadId;

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-6 py-6"
        aria-label="聊天消息"
      >
        <div className="mx-auto w-full max-w-3xl space-y-4">
          {messages.length === 0 ? (
            <div className="flex min-h-[40vh] items-center justify-center">
              <div className="rounded-panel bg-surface-raised px-8 py-10 text-center shadow-medium">
                <div className="u-label">Ready</div>
                <div className="mt-3 text-base font-semibold text-foreground">
                  开始对话
                </div>
                <div className="mt-2 text-sm text-muted">
                  主聊天区保持轻量，任务信息会进入右侧工作抽屉。
                </div>
              </div>
            </div>
          ) : (
            messages.map((m) => <MessageBubble key={m.id} message={m} />)
          )}
        </div>
      </div>

      <div className="flex-none border-t border-border bg-surface-raised p-4">
        <div className="mx-auto flex w-full max-w-3xl items-end gap-3 rounded-panel border border-border bg-surface p-2 shadow-soft">
          <textarea
            ref={taRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="发送消息... (Enter 发送，Shift+Enter 换行)"
            rows={1}
            disabled={!threadId}
            className={cn(
              'flex-1 resize-none rounded-card bg-transparent px-4 py-3 text-sm leading-6 text-foreground outline-none',
              'placeholder:text-muted disabled:opacity-50',
            )}
            style={{ maxHeight: '160px' }}
          />
          {sending ? (
            <button
              type="button"
              onClick={stop}
              className="rounded-pill border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition hover:shadow-soft"
            >
              停止
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void send()}
              disabled={!canSend}
              className={cn(
                'rounded-pill bg-accent px-5 py-2 text-sm font-medium text-white transition',
                'hover:-translate-y-px hover:shadow-soft',
                'disabled:cursor-not-allowed disabled:opacity-40',
              )}
            >
              发送
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
