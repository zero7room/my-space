import * as React from 'react';
import Link from 'next/link';

import { api } from '@/lib/api-client';

export const dynamic = 'force-dynamic';

export default async function ChannelsPage(): Promise<React.JSX.Element> {
  let bindings: Awaited<ReturnType<typeof api.listChannelBindings>>['bindings'] = [];
  let error: string | undefined;
  try {
    const res = await api.listChannelBindings();
    bindings = res.bindings;
  } catch (err) {
    error = (err as Error).message;
  }
  return (
    <main style={{ padding: '2rem', maxWidth: 960, margin: '0 auto' }}>
      <Link href="/">← back</Link>
      <h1 style={{ fontSize: '1.5rem' }}>Channel bindings</h1>
      {error && <p style={{ color: '#ff8a80' }}>{error}</p>}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {bindings.map((b) => (
          <li key={b.id}>
            <strong>{b.provider}</strong> · {b.externalConversationType} ·{' '}
            {b.status}
          </li>
        ))}
        {bindings.length === 0 && !error && <li>(no bindings)</li>}
      </ul>
    </main>
  );
}
