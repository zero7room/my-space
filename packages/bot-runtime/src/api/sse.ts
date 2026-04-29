export type SseEvent = {
  id?: string;
  event?: string;
  data?: string | object;
  comment?: string;
};

export function encodeSseEvent(e: SseEvent): string {
  if (e.comment !== undefined) return `: ${e.comment}\n\n`;
  const parts: string[] = [];
  if (e.id !== undefined) parts.push(`id: ${e.id}`);
  if (e.event !== undefined) parts.push(`event: ${e.event}`);
  if (e.data !== undefined) {
    const dataStr = typeof e.data === "string" ? e.data : JSON.stringify(e.data);
    for (const line of dataStr.split("\n")) {
      parts.push(`data: ${line}`);
    }
  }
  return `${parts.join("\n")}\n\n`;
}
