'use client';

import * as React from 'react';
import { useState } from 'react';

import { api } from '@/lib/api-client';

interface Props {
  taskId: string;
  status: string;
  blockedReason?: string;
}

export function TaskActions({ taskId, status, blockedReason }: Props): React.JSX.Element {
  const [msg, setMsg] = useState<string>();
  const terminal = status === 'completed' || status === 'cancelled';

  async function run(fn: () => Promise<unknown>, label: string): Promise<void> {
    setMsg(`${label}…`);
    try {
      await fn();
      setMsg(`${label} ok`);
    } catch (err) {
      setMsg(`${label} failed: ${(err as Error).message}`);
    }
  }

  const btn = (
    label: string,
    onClick: () => Promise<unknown>,
    enabled: boolean,
  ): React.JSX.Element => (
    <button
      key={label}
      disabled={!enabled}
      onClick={() => run(onClick, label)}
      style={{
        marginRight: '0.5rem',
        padding: '0.4rem 0.8rem',
        background: enabled ? '#3367d6' : '#2a2d31',
        border: 0,
        color: 'white',
        borderRadius: 4,
        cursor: enabled ? 'pointer' : 'not-allowed',
        opacity: enabled ? 1 : 0.5,
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ marginTop: '0.75rem' }}>
      {btn('Confirm', () => api.confirmTask(taskId), status === 'draft')}
      {btn('Cancel', () => api.cancelTask(taskId), !terminal)}
      {btn(
        'Pause',
        () => api.pauseTask(taskId),
        ['queued', 'running', 'awaiting_critical_node', 'blocked'].includes(status),
      )}
      {btn('Resume', () => api.resumeTask(taskId), status === 'paused')}
      {btn(
        'Retry',
        () => api.retryTask(taskId),
        status === 'failed' &&
          (blockedReason === 'retry_pending' ||
            blockedReason === 'retry_exhausted' ||
            blockedReason === 'awaiting_user_action' ||
            blockedReason === 'non_idempotent_tool_in_flight'),
      )}
      {msg && (
        <span style={{ marginLeft: '0.5rem', color: '#9aa0a6' }}>{msg}</span>
      )}
    </div>
  );
}
