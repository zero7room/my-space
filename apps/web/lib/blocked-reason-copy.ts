export const BLOCKED_REASON_COPY: Record<
  string,
  { title: string; description: string }
> = {
  retry_pending: {
    title: '等待自动重试',
    description: '系统检测到临时错误，稍后会自动重试。',
  },
  retry_exhausted: {
    title: '重试已用尽',
    description: '重试已达上限，请取消任务后以新的计划重启。',
  },
  awaiting_user_action: {
    title: '等待你确认',
    description: 'AI 员工在此步骤需要你的决定（重试 / 跳过 / 取消）。',
  },
  non_idempotent_tool_in_flight: {
    title: '工具执行中未确认结果',
    description:
      '上一个工具调用未返回幂等标识，需你确认是否重试或跳过以免重复副作用。',
  },
};

export function blockedReasonTitle(r?: string): string {
  if (!r) return '';
  return BLOCKED_REASON_COPY[r]?.title ?? r;
}

export function blockedReasonDescription(r?: string): string | null {
  if (!r) return null;
  return BLOCKED_REASON_COPY[r]?.description ?? null;
}
