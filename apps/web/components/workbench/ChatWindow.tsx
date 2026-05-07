'use client';
import * as React from 'react';
import type { EventEnvelope } from '@ai-workflow/contracts';
import { cn } from '../../lib/cn';
import { api } from '../../lib/api-client';
import { ThreadSseClient } from '../../lib/sse-client';
import { useSseStore } from '../../lib/stores/sse';
import { useTasksStore } from '../../lib/stores/tasks';
import { MessageBubble, type ChatMessage } from './MessageBubble';
import type { GuardDecision } from './GuardDecisionBadge';

function toRole(input: unknown): ChatMessage['role'] {
  if (input === 'user' || input === 'assistant' || input === 'system') {
    return input;
  }
  return 'assistant';
}

function toStr(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function toGuardDecision(payload: Record<string, unknown>): GuardDecision | null {
  const intent = payload['intent'];
  if (typeof intent !== 'string') return null;
  const shortCircuited =
    payload['shortCircuited'] === true || payload['short_circuited'] === true;
  const conf = payload['confidence'];
  const confidence = typeof conf === 'number' ? conf : 0;
  const rulesRaw = payload['ruleHits'] ?? payload['rule_hits'];
  const ruleHits = Array.isArray(rulesRaw)
    ? rulesRaw.filter((x): x is string => typeof x === 'string')
    : undefined;
  const reason = typeof payload['reason'] === 'string' ? payload['reason'] : undefined;
  return { intent, shortCircuited, confidence, ruleHits, reason };
}

export function ChatWindow(props: {
  threadId: string | null;
}): React.JSX.Element {
  const { threadId } = props;
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState('');
  const [sending, setSending] = React.useState(false);

  const clientRef = React.useRef<ThreadSseClient | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const taRef = React.useRef<HTMLTextAreaElement | null>(null);

  const reloadRequired = useSseStore((s) => s.reloadRequired);
  const setReloadRequired = useSseStore((s) => s.setReloadRequired);
  const setBlocked = useTasksStore((s) => s.setBlocked);

  const handleEvent = React.useCallback(
    (ev: EventEnvelope) => {
      const kind = ev.kind as string;
      const payload = (ev.payload ?? {}) as Record<string, unknown>;

      // Messages appended to the thread
      if (kind === 'message_appended' || kind === 'team_message_appended') {
        const role = toRole(payload['role']);
        const text =
          toStr(payload['text']) ||
          toStr(payload['content']) ||
          toStr(payload['body']);
        if (!text) return;
        const id =
          toStr(payload['messageId']) ||
          toStr(payload['id']) ||
          ev.id ||
          `${ev.seq}`;
        const at = toStr(payload['at']) || ev.at;
        setMessages((prev) => {
          if (prev.some((m) => m.id === id)) return prev;
          return [...prev, { id, role, text, at }];
        });
        return;
      }

      // Attach guard decision to the last user message
      if (kind === 'guard_decision_recorded') {
        const decision = toGuardDecision(payload);
        if (!decision) return;
        setMessages((prev) => {
          for (let i = prev.length - 1; i >= 0; i -= 1) {
            if (prev[i].role === 'user') {
              const next = prev.slice();
              next[i] = { ...next[i], guardDecision: decision };
              return next;
            }
          }
          return prev;
        });
        return;
      }

      // Task blocked / unblocked — forward to tasks store
      if (kind === 'task_blocked') {
        const taskId = toStr(ev.taskId) || toStr(payload['taskId']);
        if (!taskId) return;
        const blockedReason = toStr(payload['blockedReason']) || '任务已阻塞';
        const sa = payload['suggestedActions'];
        const suggestedActions = Array.isArray(sa)
          ? sa.filter((x): x is string => typeof x === 'string')
          : [];
        setBlocked(taskId, { taskId, blockedReason, suggestedActions });
        return;
      }

      if (kind === 'task_unblocked') {
        const taskId = toStr(ev.taskId) || toStr(payload['taskId']);
        if (!taskId) return;
        setBlocked(taskId, null);
        return;
      }
    },
    [setBlocked],
  );

  // Start / restart the SSE client on threadId change
  React.useEffect(() => {
    if (clientRef.current) {
      clientRef.current.close();
      clientRef.current = null;
    }
    setMessages([]);
    if (!threadId) return;
    const c = new ThreadSseClient({
      threadId,
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
  }, [threadId, handleEvent]);

  // Reload-required: clear messages, close current stream, restart fresh
  React.useEffect(() => {
    if (!reloadRequired) return;
    if (clientRef.current) {
      clientRef.current.close();
      clientRef.current = null;
    }
    setMessages([]);
    if (threadId) {
      const c = new ThreadSseClient({ threadId, onEvent: handleEvent });
      clientRef.current = c;
      c.start();
    }
    setReloadRequired(false);
  }, [reloadRequired, threadId, handleEvent, setReloadRequired]);

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
    setMessages((prev) => [
      ...prev,
      { id: optimisticId, role: 'user', text, at },
    ]);
    setInput('');
    try {
      await api.postMessage(threadId, text);
    } catch {
      // Revert the optimistic bubble on failure
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
    } finally {
      setSending(false);
    }
  }, [input, threadId, sending]);

  const stop = React.useCallback(() => {
    if (clientRef.current) clientRef.current.close();
    clientRef.current = null;
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
