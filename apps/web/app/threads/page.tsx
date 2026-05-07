import * as React from 'react';
import Link from 'next/link';

import { api } from '@/lib/api-client';

export const dynamic = 'force-dynamic';

export default async function ThreadsPage(): Promise<React.JSX.Element> {
  let threads: Awaited<ReturnType<typeof api.listThreads>>['threads'] = [];
  let error: string | undefined;
  try {
    const res = await api.listThreads();
    threads = res.threads;
  } catch (err) {
    error = (err as Error).message;
  }
  return (
    <main style={{ padding: '2rem', maxWidth: 960, margin: '0 auto' }}>
      <Link href="/">← back</Link>
      <h1 style={{ fontSize: '1.5rem' }}>Threads</h1>
      {error && (
        <p style={{ color: '#ff8a80' }}>
          Could not load threads: {error}. Set <code>NEXT_PUBLIC_BEARER</code>{' '}
          to a valid token.
        </p>
      )}
      <ul style={{ marginTop: '1rem', listStyle: 'none', padding: 0 }}>
        {threads.map((t) => (
          <li key={t.id} style={{ marginBottom: '0.5rem' }}>
            <Link href={`/threads/${t.id}`}>
              <strong>{t.title || t.id}</strong>
            </Link>{' '}
            <span style={{ color: '#9aa0a6' }}>— {t.status}</span>
          </li>
        ))}
        {threads.length === 0 && !error && (
          <li style={{ color: '#9aa0a6' }}>No threads yet.</li>
        )}
      </ul>
    </main>
  );
}
