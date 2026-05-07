import * as React from 'react';
import Link from 'next/link';

export default function HomePage(): React.JSX.Element {
  return (
    <main style={{ padding: '2rem', maxWidth: 960, margin: '0 auto' }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>AI Workflow</h1>
      <p style={{ color: '#9aa0a6' }}>
        Bot runtime client. v1 surface — chat, tasks, plans, channels, teams.
      </p>
      <ul style={{ marginTop: '2rem', listStyle: 'none', padding: 0 }}>
        <li style={{ marginBottom: '0.75rem' }}>
          <Link href="/threads">Threads</Link>
        </li>
        <li style={{ marginBottom: '0.75rem' }}>
          <Link href="/policies">Critical-node policies</Link>
        </li>
        <li style={{ marginBottom: '0.75rem' }}>
          <Link href="/channels">Channels</Link>
        </li>
      </ul>
    </main>
  );
}
