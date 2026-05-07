'use client';

import * as React from 'react';
import { useEffect, useState } from 'react';

import { api } from '@/lib/api-client';

export function RetryHistoryPanel({ taskId }: { taskId: string }): React.JSX.Element {
  const [entries, setEntries] = useState<
    Awaited<ReturnType<typeof api.retryHistory>>['entries']
  >([]);
  const [err, setErr] = useState<string>();
  useEffect(() => {
    api
      .retryHistory(taskId)
      .then((r) => setEntries(r.entries))
      .catch((e) => setErr((e as Error).message));
  }, [taskId]);

  if (err) {
    return <section style={{ opacity: 0.7 }}>retry history: {err}</section>;
  }
  if (entries.length === 0) {
    return (
      <section style={{ opacity: 0.7, marginTop: '1.5rem' }}>
        No retry history.
      </section>
    );
  }
  return (
    <section style={{ marginTop: '1.5rem' }}>
      <h3>Retry history</h3>
      <table
        style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}
      >
        <thead>
          <tr style={{ color: '#9aa0a6', textAlign: 'left' }}>
            <th>at</th>
            <th>attempt</th>
            <th>class</th>
            <th>summary</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.eventId} style={{ borderTop: '1px solid #1e2227' }}>
              <td>{e.at}</td>
              <td>{e.attemptCount}</td>
              <td>{e.failureClass ?? '-'}</td>
              <td>{e.summary || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
