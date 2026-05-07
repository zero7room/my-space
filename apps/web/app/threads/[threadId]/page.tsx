'use client';
import * as React from 'react';
import { useParams } from 'next/navigation';
import { WorkbenchPage } from '../../../components/workbench/WorkbenchPage';

export default function ThreadDetailPage(): React.JSX.Element {
  const params = useParams<{ threadId: string }>();
  return <WorkbenchPage initialThreadId={params?.threadId ?? null} />;
}
