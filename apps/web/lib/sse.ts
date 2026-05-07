/**
 * SSE stream consumer for `/api/threads/:id/events`. Returns an async
 * iterable of `EventEnvelope` while the connection is alive.
 */
import type { EventEnvelope } from '@ai-workflow/contracts';

export async function* streamThreadEvents(
  threadId: string,
  bearer: string,
  baseUrl: string,
  sinceSeq?: number,
  signal?: AbortSignal,
): AsyncGenerator<EventEnvelope> {
  const url = new URL(`${baseUrl}/api/threads/${threadId}/events`);
  if (sinceSeq !== undefined) url.searchParams.set('since', String(sinceSeq));
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${bearer}` },
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`sse ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) return;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const dataLine = frame
        .split('\n')
        .find((l) => l.startsWith('data: '));
      if (!dataLine) continue;
      const json = dataLine.slice('data: '.length);
      try {
        yield JSON.parse(json) as EventEnvelope;
      } catch {
        // ignore malformed frame
      }
    }
  }
}
