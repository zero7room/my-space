'use client';
import * as React from 'react';
import { api } from '../../lib/api-client';
import { showError, showSuccess } from './ToastProvider';

type FeishuFields = {
  botAppId?: string;
  botName?: string;
  operatorOpenId?: string;
};

type FeishuConfigRaw = {
  provider?: string;
  enabled?: boolean;
  hasSecret?: boolean;
  hasBotAppSecret?: boolean;
  hasBotSigningSecret?: boolean;
  fields?: FeishuFields & Record<string, unknown>;
} & Record<string, unknown>;

type FormState = {
  enabled: boolean;
  botAppId: string;
  botName: string;
  operatorOpenId: string;
  botAppSecret: string;
  botSigningSecret: string;
  editAppSecret: boolean;
  editSigningSecret: boolean;
};

const INITIAL_FORM: FormState = {
  enabled: false,
  botAppId: '',
  botName: '',
  operatorOpenId: '',
  botAppSecret: '',
  botSigningSecret: '',
  editAppSecret: false,
  editSigningSecret: false,
};

function pickFeishu(raw: unknown): FeishuConfigRaw | null {
  if (!raw || typeof raw !== 'object') return null;
  const maybeList = (raw as { configs?: unknown }).configs;
  const list = Array.isArray(maybeList) ? maybeList : [];
  for (const item of list) {
    if (
      item &&
      typeof item === 'object' &&
      (item as { provider?: string }).provider === 'feishu'
    ) {
      return item as FeishuConfigRaw;
    }
  }
  return null;
}

function toFormState(raw: FeishuConfigRaw | null): FormState {
  const fields = (raw?.fields ?? {}) as FeishuFields;
  return {
    enabled: Boolean(raw?.enabled),
    botAppId: String(fields.botAppId ?? ''),
    botName: String(fields.botName ?? ''),
    operatorOpenId: String(fields.operatorOpenId ?? ''),
    botAppSecret: '',
    botSigningSecret: '',
    editAppSecret: false,
    editSigningSecret: false,
  };
}

function hasAppSecret(raw: FeishuConfigRaw | null): boolean {
  if (!raw) return false;
  if (raw.hasBotAppSecret === true) return true;
  if (raw.hasSecret === true) return true;
  return false;
}

function hasSigningSecret(raw: FeishuConfigRaw | null): boolean {
  if (!raw) return false;
  if (raw.hasBotSigningSecret === true) return true;
  if (raw.hasSecret === true) return true;
  return false;
}

export function FeishuConfigSheet(props: {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}): React.JSX.Element | null {
  const { open, onClose, onSaved } = props;
  const [raw, setRaw] = React.useState<FeishuConfigRaw | null>(null);
  const [form, setForm] = React.useState<FormState>(INITIAL_FORM);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setLoaded(false);
      return;
    }
    if (loaded) return;
    let cancelled = false;
    setLoading(true);
    api
      .listChannelConfigs()
      .then((res) => {
        if (cancelled) return;
        const found = pickFeishu(res);
        setRaw(found);
        setForm(toFormState(found));
        setLoaded(true);
      })
      .catch((err) => {
        if (!cancelled) showError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, loaded]);

  if (!open) return null;

  function update<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        enabled: form.enabled,
        botAppId: form.botAppId.trim(),
        botName: form.botName.trim(),
        operatorOpenId: form.operatorOpenId.trim(),
      };
      if (form.editAppSecret && form.botAppSecret.trim().length > 0) {
        body['botAppSecret'] = form.botAppSecret.trim();
      }
      if (form.editSigningSecret && form.botSigningSecret.trim().length > 0) {
        body['botSigningSecret'] = form.botSigningSecret.trim();
      }
      await api.putChannelConfig('feishu', body);
      showSuccess('配置已保存');
      onSaved?.();
      onClose();
    } catch (err) {
      showError(err);
    } finally {
      setSaving(false);
    }
  }

  const appSecretStored = hasAppSecret(raw);
  const signingSecretStored = hasSigningSecret(raw);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="feishu-config-title"
    >
      <div className="w-[min(92vw,560px)] rounded-panel bg-surface-raised p-6 shadow-medium">
        <div className="flex items-start justify-between">
          <div>
            <div className="u-label mb-1">Channel Config</div>
            <h2 id="feishu-config-title" className="text-lg font-semibold">
              飞书配置
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭飞书配置"
            className="rounded-pill border border-border bg-surface px-3 py-1 text-xs text-muted"
          >
            关闭
          </button>
        </div>

        {loading ? (
          <div className="mt-4 rounded-card border border-border bg-surface p-4 text-sm text-muted">
            正在读取飞书配置...
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <label className="flex items-center justify-between rounded-card border border-border bg-surface px-4 py-3">
              <div>
                <div className="text-sm font-medium text-foreground">启用飞书通信</div>
                <div className="mt-1 text-xs text-muted">
                  开启后将为新绑定线程同步维护飞书群。
                </div>
              </div>
              <input
                aria-label="启用飞书通信"
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => update('enabled', e.target.checked)}
                className="h-4 w-4 accent-accent"
              />
            </label>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <TextField
                label="Bot App ID"
                value={form.botAppId}
                onChange={(v) => update('botAppId', v)}
              />
              <TextField
                label="Bot Name"
                value={form.botName}
                onChange={(v) => update('botName', v)}
              />
              <TextField
                label="Operator Open ID"
                value={form.operatorOpenId}
                onChange={(v) => update('operatorOpenId', v)}
              />
              <div />
              <SecretField
                label="Bot App Secret"
                stored={appSecretStored}
                editing={form.editAppSecret}
                value={form.botAppSecret}
                onToggle={() => {
                  update('editAppSecret', !form.editAppSecret);
                  update('botAppSecret', '');
                }}
                onChange={(v) => update('botAppSecret', v)}
              />
              <SecretField
                label="Bot Signing Secret"
                stored={signingSecretStored}
                editing={form.editSigningSecret}
                value={form.botSigningSecret}
                onToggle={() => {
                  update('editSigningSecret', !form.editSigningSecret);
                  update('botSigningSecret', '');
                }}
                onChange={(v) => update('botSigningSecret', v)}
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="rounded-pill border border-border bg-surface px-4 py-2 text-sm"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-pill bg-accent px-4 py-2 text-sm text-white shadow-soft disabled:opacity-50"
              >
                {saving ? '保存中...' : '保存配置'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function TextField(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}): React.JSX.Element {
  return (
    <label className="block">
      <div className="u-label mb-1">{props.label}</div>
      <input
        aria-label={props.label}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className="w-full rounded-card border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none"
      />
    </label>
  );
}

function SecretField(props: {
  label: string;
  stored: boolean;
  editing: boolean;
  value: string;
  onToggle: () => void;
  onChange: (v: string) => void;
}): React.JSX.Element {
  const showInput = !props.stored || props.editing;
  return (
    <label className="block">
      <div className="u-label mb-1 flex items-center justify-between">
        <span>{props.label}</span>
        {props.stored && !props.editing ? (
          <span className="inline-flex items-center rounded-pill bg-success/20 px-2 py-0.5 text-[10px] text-success">
            [已保存]
          </span>
        ) : null}
      </div>
      {showInput ? (
        <div className="flex items-center gap-2">
          <input
            aria-label={props.label}
            type="password"
            value={props.value}
            placeholder={props.stored ? '输入新值以覆盖' : '未设置'}
            onChange={(e) => props.onChange(e.target.value)}
            className="w-full rounded-card border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none"
          />
          {props.stored ? (
            <button
              type="button"
              onClick={props.onToggle}
              className="rounded-pill border border-border bg-surface px-2 py-1 text-xs text-muted"
            >
              取消
            </button>
          ) : null}
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-card border border-border bg-surface px-3 py-2 text-sm text-muted">
          <span>••••••••</span>
          <button
            type="button"
            onClick={props.onToggle}
            className="rounded-pill border border-border bg-surface-raised px-2 py-1 text-xs text-accent"
          >
            重新输入
          </button>
        </div>
      )}
    </label>
  );
}
