import * as React from 'react';
import Link from 'next/link';

import { ThreadView } from '@/components/ThreadView';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ threadId: string }>;
}

export default async function ThreadDetailPage({ params }: PageProps): Promise<React.JSX.Element> {
  const { threadId } = await params;
  return (
    <main style={{ padding: '2rem', maxWidth: 1280, margin: '0 auto' }}>
      <Link href="/threads">← all threads</Link>
      <h1 style={{ fontSize: '1.5rem' }}>Thread {threadId}</h1>
      <ThreadView threadId={threadId} />
    </main>
  );
}
