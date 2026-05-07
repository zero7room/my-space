'use client';
import * as React from 'react';
import type { ChannelBindingListResponse } from '@ai-workflow/contracts';
import { api } from '../../lib/api-client';
import { showError, showInfo, showSuccess } from './ToastProvider';
import { BindingStatusBadge } from './BindingStatusBadge';
import { FeishuConfigSheet } from './FeishuConfigSheet';

type Binding = ChannelBindingListResponse['bindings'][number];

const STATUS_VALUES = new Set([
  'binding',
  'bound',
  'unbinding',
  'failed',
  'disabled',
]);

function normalizeStatus(
  s: unknown,
): 'binding' | 'bound' | 'unbinding' | 'failed' | 'disabled' | 'unknown' {
  if (typeof s === 'string' && STATUS_VALUES.has(s)) {
    return s as 'binding' | 'bound' | 'unbinding' | 'failed' | 'disabled';
  }
  return 'unknown';
}

function shortId(id: string): string {
  if (!id) return '—';
  if (id.length <= 14) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

function providerLabel(p: string): string {
  if (p === 'feishu') return '飞书';
  return p;
}

function providerIcon(p: string): string {
  if (p === 'feishu') return 'F';
  return p.charAt(0).toUpperCase() || '?';
}

export function ChannelsDrawer(props: {
  open: boolean;
  onClose: () => void;
  threadId?: string | null;
}): React.JSX.Element | null {
  const { open, onClose, threadId } = props;
  const [bindings, setBindings] = React.useState<Binding[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [feishuOpen, setFeishuOpen] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listChannelBindings();
      setBindings(res.bindings ?? []);
    } catch (err) {
      showError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  if (!open) return null;

  const filtered = threadId
    ? bindings.filter((b) => b.threadId === threadId)
    : bindings;

  async function handleDelete(id: string): Promise<void> {
    if (typeof window !== 'undefined' && !window.confirm('确认解绑该渠道？')) {
      return;
    }
    try {
      await api.deleteBinding(id);
      showSuccess('已请求解绑');
      void refresh();
    } catch (err) {
      showError(err);
    }
  }

  async function handleEnable(provider: string): Promise<void> {
    try {
      await api.putChannelConfig(provider, { enabled: true });
      showSuccess('已启用');
      void refresh();
    } catch (err) {
      showError(err);
    }
  }

  function handleRetry(): void {
    showInfo('重试链路 v1 未实现');
  }

  return (
    <>
      <div
        className={`fixed right-0 top-0 bottom-0 z-30 flex w-[min(92vw,480px)] flex-col border-l border-border bg-surface-raised shadow-drawer backdrop-blur-xl transition-transform ${open ? 'translate-x-0' : 'translate-x-full'}`}
        role="dialog"
        aria-modal="false"
        aria-label="渠道抽屉"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <div className="u-label">Channels</div>
            <h2 className="text-base font-semibold text-foreground">渠道</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="rounded-pill bg-accent px-3 py-1 text-xs text-white shadow-soft"
            >
              + 新建绑定
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭渠道抽屉"
              className="rounded-pill border border-border bg-surface px-3 py-1 text-xs text-muted"
            >
              关闭
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="text-sm text-muted">加载中...</div>
          ) : filtered.length === 0 ? (
            <div className="rounded-card border border-border bg-surface p-4 text-sm text-muted">
              暂无渠道绑定。
            </div>
          ) : (
            <ul className="space-y-3">
              {filtered.map((b) => {
                const status = normalizeStatus(b.status);
                return (
                  <li
                    key={b.id}
                    className="rounded-card border border-border bg-surface p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-pill bg-accent-soft text-xs text-accent">
                          {providerIcon(b.provider)}
                        </span>
                        <span className="text-sm font-medium text-foreground">
                          {providerLabel(b.provider)}
                        </span>
                        <BindingStatusBadge status={status} />
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleDelete(b.id)}
                        aria-label="解绑"
                        className="rounded-pill border border-border bg-surface-raised px-2 py-1 text-xs text-danger"
                      >
                        删除
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                      <span>ID: {shortId(b.externalConversationId ?? '')}</span>
                      <span>类型: {b.externalConversationType}</span>
                      <label className="inline-flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={Boolean(b.notifyDefault)}
                          readOnly
                          className="h-3 w-3 accent-accent"
                        />
                        默认通知
                      </label>
                    </div>
                    {status === 'disabled' ? (
                      <div className="mt-2">
                        <button
                          type="button"
                          onClick={() => void handleEnable(b.provider)}
                          className="rounded-pill bg-accent px-3 py-1 text-xs text-white shadow-soft"
                        >
                          启用
                        </button>
                      </div>
                    ) : null}
                    {status === 'failed' ? (
                      <div className="mt-2">
                        <button
                          type="button"
                          onClick={handleRetry}
                          className="rounded-pill border border-warning/40 bg-warning/10 px-3 py-1 text-xs text-warning"
                        >
                          重试
                        </button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={() => setFeishuOpen(true)}
            className="w-full rounded-pill border border-border bg-surface px-4 py-2 text-sm text-foreground"
          >
            Feishu bot 配置
          </button>
        </div>
      </div>

      <FeishuConfigSheet
        open={feishuOpen}
        onClose={() => setFeishuOpen(false)}
        onSaved={() => {
          void refresh();
        }}
      />

      {createOpen ? (
        <CreateBindingModal
          threadId={threadId ?? null}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            void refresh();
          }}
        />
      ) : null}
    </>
  );
}

function CreateBindingModal(props: {
  threadId: string | null;
  onClose: () => void;
  onCreated: () => void;
}): React.JSX.Element {
  const [provider, setProvider] = React.useState('feishu');
  const [externalConversationId, setExternalConversationId] = React.useState('');
  const [conversationType, setConversationType] = React.useState<
    'dm' | 'group' | 'topic'
  >('group');
  const [notifyDefault, setNotifyDefault] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!props.threadId) {
      showError(new Error('当前无关联线程，无法创建绑定'));
      return;
    }
    setBusy(true);
    try {
      await api.createBinding({
        threadId: props.threadId,
        provider,
        externalConversationId: externalConversationId.trim() || undefined,
        externalConversationType: conversationType,
        notifyDefault,
      });
      showSuccess('绑定已创建');
      props.onCreated();
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-[min(92vw,420px)] rounded-panel bg-surface-raised p-5 shadow-medium">
        <div className="u-label mb-1">新建绑定</div>
        <h3 className="text-base font-semibold">添加渠道绑定</h3>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <label className="block">
            <div className="u-label mb-1">Provider</div>
            <select
              aria-label="Provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="w-full rounded-card border border-border bg-surface px-3 py-2 text-sm"
            >
              <option value="feishu">Feishu</option>
            </select>
          </label>
          <label className="block">
            <div className="u-label mb-1">External Conversation ID</div>
            <input
              aria-label="External Conversation ID"
              value={externalConversationId}
              onChange={(e) => setExternalConversationId(e.target.value)}
              className="w-full rounded-card border border-border bg-surface px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <div className="u-label mb-1">会话类型</div>
            <select
              aria-label="会话类型"
              value={conversationType}
              onChange={(e) =>
                setConversationType(e.target.value as 'dm' | 'group' | 'topic')
              }
              className="w-full rounded-card border border-border bg-surface px-3 py-2 text-sm"
            >
              <option value="dm">dm</option>
              <option value="group">group</option>
              <option value="topic">topic</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={notifyDefault}
              onChange={(e) => setNotifyDefault(e.target.checked)}
              className="h-4 w-4 accent-accent"
            />
            默认通知
          </label>

          {!props.threadId ? (
            <div className="rounded-card border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
              当前未关联线程，无法创建。请在具体线程中打开渠道抽屉。
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={props.onClose}
              disabled={busy}
              className="rounded-pill border border-border bg-surface px-3 py-1.5 text-sm"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={busy || !props.threadId}
              className="rounded-pill bg-accent px-3 py-1.5 text-sm text-white shadow-soft disabled:opacity-50"
            >
              {busy ? '创建中...' : '创建'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
