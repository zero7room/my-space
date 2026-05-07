'use client';
import * as React from 'react';

type BindingStatus =
  | 'binding'
  | 'bound'
  | 'unbinding'
  | 'failed'
  | 'disabled'
  | 'unknown';

const STATUS_LABEL: Record<BindingStatus, string> = {
  binding: '绑定中',
  bound: '已绑定',
  unbinding: '解绑中',
  failed: '失败',
  disabled: '已停用',
  unknown: '未知',
};

function colorClass(status: BindingStatus): string {
  switch (status) {
    case 'bound':
      return 'bg-success/20 text-success';
    case 'binding':
    case 'unbinding':
      return 'bg-warning/20 text-warning';
    case 'failed':
      return 'bg-danger/20 text-danger';
    case 'disabled':
    case 'unknown':
    default:
      return 'bg-surface-strong text-muted';
  }
}

export function BindingStatusBadge(props: {
  status: BindingStatus;
}): React.JSX.Element {
  const { status } = props;
  return (
    <span
      className={`inline-flex items-center rounded-pill px-2 py-0.5 text-xs ${colorClass(status)}`}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}
