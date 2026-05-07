'use client';

import * as React from 'react';
import { useEffect, useState } from 'react';

import type { EventEnvelope } from '@ai-workflow/contracts';

import { streamThreadEvents } from '@/lib/sse';

const BASE = process.env['NEXT_PUBLIC_RUNTIME_URL'] ?? 'http://localhost:4000';
const BEARER = process.env['NEXT_PUBLIC_BEARER'] ?? '';

export function ThreadView({ threadId }: { threadId: string }): React.JSX.Element {
  const [text, setText] = useState('');
  const [events, setEvents] = useState<EventEnvelope[]>([]);
  const [status, setStatus] = useState<'idle' | 'streaming' | 'closed' | 'error'>('idle');

  useEffect(() => {
    if (!BEARER) return;
    const ac = new AbortController();
    setStatus('streaming');
    (async () => {
      try {
        for await (const ev of streamThreadEvents(threadId, BEARER, BASE, undefined, ac.signal)) {
          setEvents((prev) => [...prev, ev]);
        }
        setStatus('closed');
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setStatus('error');
      }
    })();
    return () => ac.abort();
  }, [threadId]);

  async function send(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!text.trim()) return;
    await fetch(`${BASE}/api/threads/${threadId}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${BEARER}`,
      },
      body: JSON.stringify({ text }),
    });
    setText('');
  }

  return (
    <section style={{ marginTop: '1rem' }}>
      <p style={{ color: '#9aa0a6' }}>SSE: {status}</p>
      <form onSubmit={send} style={{ marginBottom: '1rem' }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type to bot…"
          style={{
            width: '70%',
            padding: '0.5rem',
            background: '#1a1d22',
            border: '1px solid #333',
            color: '#e8eaed',
          }}
        />
        <button
          type="submit"
          style={{
            marginLeft: '0.5rem',
            padding: '0.5rem 1rem',
            background: '#3367d6',
            border: 0,
            color: 'white',
          }}
        >
          Send
        </button>
      </form>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {events.map((e) => (
          <li
            key={e.id}
            style={{
              padding: '0.5rem',
              borderLeft: '2px solid #3367d6',
              marginBottom: '0.25rem',
              background: '#13161a',
            }}
          >
            <code>{e.kind}</code>{' '}
            <span style={{ color: '#9aa0a6' }}>seq={e.seq}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
