'use client';

import * as React from 'react';
import { useEffect, useState } from 'react';

import { api } from '@/lib/api-client';

type Team = Awaited<ReturnType<typeof api.listTeams>>['teams'][number];

export function TeamPanel({ taskId }: { taskId: string }): React.JSX.Element {
  const [teams, setTeams] = useState<Team[]>([]);
  const [err, setErr] = useState<string>();
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    api
      .listTeams(taskId)
      .then((r) => setTeams(r.teams))
      .catch((e) => setErr((e as Error).message));
  }, [taskId]);

  if (err) return <section style={{ opacity: 0.7 }}>teams: {err}</section>;
  if (teams.length === 0) {
    return <section style={{ opacity: 0.7 }}>No teams for this task.</section>;
  }
  return (
    <section
      style={{
        background: '#12151a',
        border: '1px solid #1e2227',
        padding: '1rem',
        borderRadius: 6,
      }}
    >
      <h3 style={{ margin: 0 }}>Teams</h3>
      <ul style={{ marginTop: '0.5rem', padding: 0, listStyle: 'none' }}>
        {teams.map((t) => (
          <li key={t.id} style={{ marginBottom: '0.5rem' }}>
            <button
              onClick={() => setExpanded(expanded === t.id ? null : t.id)}
              style={{
                background: 'transparent',
                border: 0,
                color: '#8ab4f8',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              {expanded === t.id ? '▾' : '▸'} {t.id} ·{' '}
              <code>{t.status}</code> · roster={t.roster.length}
            </button>
            {expanded === t.id && <TeamDetail taskId={taskId} teamId={t.id} />}
          </li>
        ))}
      </ul>
    </section>
  );
}

function TeamDetail({
  taskId,
  teamId,
}: {
  taskId: string;
  teamId: string;
}): React.JSX.Element {
  const [items, setItems] = useState<Awaited<
    ReturnType<typeof api.teamWorkItems>
  > | null>(null);
  const [mates, setMates] = useState<Awaited<
    ReturnType<typeof api.teammates>
  > | null>(null);
  useEffect(() => {
    api.teamWorkItems(taskId, teamId).then(setItems).catch(() => undefined);
    api.teammates(taskId, teamId).then(setMates).catch(() => undefined);
  }, [taskId, teamId]);
  return (
    <div style={{ marginTop: '0.5rem', paddingLeft: '1rem' }}>
      <p style={{ color: '#9aa0a6' }}>
        Teammates: {mates?.teammates.length ?? '…'} · Work items:{' '}
        {items?.workItems.length ?? '…'}
      </p>
      <ul>
        {items?.workItems.slice(0, 6).map((w) => (
          <li key={w.id}>
            <code>{w.status}</code> {w.description.slice(0, 80)}
          </li>
        ))}
      </ul>
    </div>
  );
}
