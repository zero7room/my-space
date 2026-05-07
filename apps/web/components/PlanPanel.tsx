'use client';

import * as React from 'react';
import { useEffect, useState } from 'react';

import { api } from '@/lib/api-client';

export function PlanPanel({ taskId }: { taskId: string }): React.JSX.Element {
  const [plan, setPlan] = useState<Awaited<ReturnType<typeof api.taskPlans>> | null>(null);
  const [err, setErr] = useState<string>();

  useEffect(() => {
    api
      .taskPlans(taskId)
      .then(setPlan)
      .catch((e) => setErr((e as Error).message));
  }, [taskId]);

  if (err) {
    return <section style={{ opacity: 0.7 }}>plan: {err}</section>;
  }
  if (!plan) return <section style={{ opacity: 0.7 }}>plan: loading…</section>;
  if (!plan.plan) return <section style={{ opacity: 0.7 }}>No plan yet.</section>;
  return (
    <section
      style={{
        background: '#12151a',
        border: '1px solid #1e2227',
        padding: '1rem',
        borderRadius: 6,
      }}
    >
      <h3 style={{ margin: 0 }}>Plan</h3>
      <p style={{ color: '#9aa0a6', marginTop: '0.25rem' }}>
        {plan.plan.objective}
      </p>
      <ol style={{ marginTop: '0.5rem' }}>
        {plan.plan.steps.map((s) => (
          <li key={s.id} style={{ marginBottom: '0.25rem' }}>
            <code style={{ color: statusColor(s.status) }}>{s.status}</code>{' '}
            {s.title}
          </li>
        ))}
      </ol>
      <details style={{ marginTop: '0.75rem' }}>
        <summary style={{ color: '#9aa0a6', cursor: 'pointer' }}>
          Revisions ({plan.revisions.length})
        </summary>
        <ul style={{ marginTop: '0.5rem' }}>
          {plan.revisions.map((r) => (
            <li key={r.id}>
              <code>{r.status}</code> {r.reason} —{' '}
              <span style={{ color: '#9aa0a6' }}>{r.createdAt}</span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

function statusColor(s: string): string {
  switch (s) {
    case 'completed':
      return '#81c995';
    case 'failed':
      return '#ff8a80';
    case 'in_progress':
      return '#8ab4f8';
    case 'skipped':
    case 'superseded':
      return '#9aa0a6';
    default:
      return '#e8eaed';
  }
}
