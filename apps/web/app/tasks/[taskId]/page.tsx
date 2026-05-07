import * as React from 'react';
import Link from 'next/link';

import { api } from '@/lib/api-client';
import { TaskActions } from '@/components/TaskActions';
import { PlanPanel } from '@/components/PlanPanel';
import { TeamPanel } from '@/components/TeamPanel';
import { RetryHistoryPanel } from '@/components/RetryHistoryPanel';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ taskId: string }>;
}

export default async function TaskPage({ params }: PageProps): Promise<React.JSX.Element> {
  const { taskId } = await params;
  let taskLoad:
    | Awaited<ReturnType<typeof api.getTask>>
    | { error: string }
    | undefined;
  try {
    taskLoad = await api.getTask(taskId);
  } catch (err) {
    taskLoad = { error: (err as Error).message };
  }
  if (!taskLoad || 'error' in taskLoad) {
    return (
      <main style={{ padding: '2rem' }}>
        <Link href="/threads">← threads</Link>
        <h1>Task {taskId}</h1>
        <p style={{ color: '#ff8a80' }}>
          Could not load task: {(taskLoad as { error: string })?.error ?? 'unknown'}
        </p>
      </main>
    );
  }
  const t = taskLoad.task;
  return (
    <main style={{ padding: '2rem', maxWidth: 1280, margin: '0 auto' }}>
      <Link href={`/threads/${t.threadId}`}>← thread</Link>
      <h1 style={{ fontSize: '1.5rem' }}>{t.title || t.id}</h1>
      <p style={{ color: '#9aa0a6' }}>
        status=<code>{t.status}</code>
        {t.blockedReason && (
          <>
            {' '}
            · reason=<code>{t.blockedReason}</code>
          </>
        )}
        {t.retry && (
          <>
            {' '}
            · retry={t.retry.attemptCount}/{t.retry.maxRetries}
          </>
        )}
      </p>
      <TaskActions taskId={t.id} status={t.status} blockedReason={t.blockedReason} />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '1.5rem',
          marginTop: '2rem',
        }}
      >
        <PlanPanel taskId={t.id} />
        <TeamPanel taskId={t.id} />
      </div>
      <RetryHistoryPanel taskId={t.id} />
    </main>
  );
}
