import Link from "next/link";
import { MessageSquare } from "lucide-react";

import { RelationGraph } from "@/components/charts/relation-graph";
import { EmptyState } from "@/components/features/empty-state";
import { Button } from "@/components/ui/button";
import { getLocalGraph, getMarketOverview } from "@/lib/app/api";

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const {
    data: { events },
  } = await getMarketOverview();
  const event = events.find((item) => item.id === id);
  const { nodes: graphNodes, edges: graphEdges } = getLocalGraph();

  if (!event) {
    return (
      <EmptyState
        title="事件不存在"
        message={`没有找到事件 ${id}。`}
        backHref="/analysis/market"
      />
    );
  }

  return (
    <main className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-6">
      <header className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">分析 / 事件 / {event.id}</p>
          <h1 className="mt-2 text-2xl font-semibold">{event.title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{event.summary}</p>
        </div>
        <Button asChild>
          <Link href="/chat/thread_nvda">
            <MessageSquare aria-hidden="true" />
            在 Chat 中追问
          </Link>
        </Button>
      </header>

      <section className="border bg-card p-5">
        <h2 className="text-base font-semibold">受影响对象</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {event.affectedSectors.map((sector) => (
            <span key={sector} className="border bg-accent px-2 py-1 text-sm text-accent-foreground">
              {sector}
            </span>
          ))}
        </div>
      </section>

      <RelationGraph nodes={graphNodes} edges={graphEdges} title="跨市场影响图" />

      <section className="border bg-card p-5">
        <h2 className="text-base font-semibold">传导路径</h2>
        <div className="mt-4 grid gap-3">
          {event.paths.map((path) => (
            <article key={`${path.from}-${path.to}`} className="border bg-background p-4">
              <p className="font-medium">
                {path.from} → {path.through} → {path.to}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                影响：{path.impact} · 置信度 {Math.round(path.confidence * 100)}%
              </p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
