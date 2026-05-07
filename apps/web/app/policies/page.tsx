import * as React from 'react';
import Link from 'next/link';

import { api } from '@/lib/api-client';

export const dynamic = 'force-dynamic';

export default async function PoliciesPage(): Promise<React.JSX.Element> {
  let policies: Awaited<ReturnType<typeof api.listPolicies>>['policies'] = [];
  let error: string | undefined;
  try {
    const res = await api.listPolicies();
    policies = res.policies;
  } catch (err) {
    error = (err as Error).message;
  }
  return (
    <main style={{ padding: '2rem', maxWidth: 960, margin: '0 auto' }}>
      <Link href="/">← back</Link>
      <h1 style={{ fontSize: '1.5rem' }}>Critical-node policies</h1>
      {error && <p style={{ color: '#ff8a80' }}>{error}</p>}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {policies.map((p) => (
          <li key={p.id}>
            <code>{p.scope}</code> <strong>{p.matcher.kind}</strong> →{' '}
            <code>{p.action}</code>
          </li>
        ))}
        {policies.length === 0 && !error && <li>(none configured)</li>}
      </ul>
    </main>
  );
}
