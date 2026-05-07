'use client';
import * as React from 'react';
import { useSseStore } from '../../lib/stores/sse';

export function DegradedBanner(): React.JSX.Element | null {
  const { degraded, replaying, replayFrom, replayTo, reloadRequired } =
    useSseStore();
  if (reloadRequired) {
    return (
      <div className="flex items-center justify-between gap-4 bg-danger/10 px-4 py-2 text-sm text-danger">
        <span>
          事件缓冲已溢出，需要重新加载当前线程。
        </span>
        <button
          type="button"
          className="rounded-full bg-danger px-3 py-1 text-xs font-medium text-white"
          onClick={() => window.location.reload()}
        >
          立即重载
        </button>
      </div>
    );
  }
  if (replaying && replayFrom !== null && replayTo !== null) {
    return (
      <div className="flex items-center gap-3 bg-warning/10 px-4 py-2 text-sm text-warning">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-warning" />
        <span>
          正在补齐事件 {replayFrom} – {replayTo}，界面更新暂停。
        </span>
      </div>
    );
  }
  if (degraded) {
    return (
      <div className="flex items-center gap-3 bg-warning/10 px-4 py-2 text-sm text-warning">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-warning" />
        <span>AI 员工事件流降级中，正在尝试补齐。</span>
      </div>
    );
  }
  return null;
}
