'use client';
import * as React from 'react';
import { cn } from '../../lib/cn';
import { useTasksStore } from '../../lib/stores/tasks';
import { DegradedBanner } from './DegradedBanner';

export function WorkbenchShell({
  sidebar,
  header,
  drawer,
  children,
}: {
  sidebar: React.ReactNode;
  header: React.ReactNode;
  drawer: React.ReactNode;
  children: React.ReactNode;
}): React.JSX.Element {
  const drawerOpen = useTasksStore((s) => s.drawerOpen);
  return (
    <div className="flex h-dvh min-w-0 text-foreground">
      <aside
        className={cn(
          'flex h-full flex-col border-r border-border bg-[rgba(255,250,243,0.72)] backdrop-blur transition-[width] duration-200',
          drawerOpen ? 'w-20' : 'w-64',
        )}
      >
        {sidebar}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <DegradedBanner />
        <header className="flex-none border-b border-border bg-[rgba(255,250,243,0.72)] backdrop-blur">
          {header}
        </header>
        <main className="relative flex min-w-0 flex-1 overflow-hidden">
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {children}
          </div>
          {drawerOpen ? (
            <aside
              aria-label="任务抽屉"
              className="flex h-full w-[min(46vw,560px)] min-w-[420px] flex-col border-l border-border bg-[rgba(245,235,224,0.94)] backdrop-blur-xl shadow-[-20px_0_60px_rgba(90,68,42,0.08)]"
            >
              {drawer}
            </aside>
          ) : null}
        </main>
      </div>
    </div>
  );
}
