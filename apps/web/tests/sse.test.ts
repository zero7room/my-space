import { describe, it, expect } from 'vitest';

import { streamThreadEvents } from '../lib/sse';

class FakeReadable {
  constructor(private chunks: string[]) {}
  getReader() {
    let i = 0;
    return {
      read: async (): Promise<{ value?: Uint8Array; done: boolean }> => {
        if (i >= this.chunks.length) return { done: true };
        const c = new TextEncoder().encode(this.chunks[i++]!);
        return { value: c, done: false };
      },
    };
  }
}

describe('streamThreadEvents', () => {
  it('parses SSE frames into envelopes', async () => {
    const fake = new FakeReadable([
      ': ok\n\n',
      'id: 0\nevent: task_started\ndata: {"id":"ev_a","seq":0,"kind":"task_started","payload":{},"at":"2026-05-07T00:00:00.000Z"}\n\n',
      'id: 1\nevent: task_completed\ndata: {"id":"ev_b","seq":1,"kind":"task_completed","payload":{},"at":"2026-05-07T00:00:01.000Z"}\n\n',
    ]);
    const origFetch = globalThis.fetch;
    (globalThis as { fetch: typeof fetch }).fetch = (async () => ({
      ok: true,
      body: fake,
      status: 200,
      statusText: 'OK',
    })) as unknown as typeof fetch;
    try {
      const out: string[] = [];
      for await (const ev of streamThreadEvents(
        'th_aaaaaaaaaaaaaaaaaaaaa',
        'tok',
        'http://localhost',
      )) {
        out.push(ev.kind);
        if (out.length >= 2) break;
      }
      expect(out).toEqual(['task_started', 'task_completed']);
    } finally {
      (globalThis as { fetch: typeof fetch }).fetch = origFetch;
    }
  });
});
