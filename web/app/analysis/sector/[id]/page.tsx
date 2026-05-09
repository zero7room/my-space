import Link from "next/link";
import { MessageSquare } from "lucide-react";

import { RelationGraph } from "@/components/charts/relation-graph";
import { ScoreRadar } from "@/components/charts/score-radar";
import { ArtifactCard } from "@/components/features/artifact-card";
import { EmptyState } from "@/components/features/empty-state";
import { Button } from "@/components/ui/button";
import { getArtifact, getLocalGraph, getLocalLeaderStocks, getSectorLatest } from "@/lib/app/api";

export default async function SectorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ data: sector, error }, { data: artifact }] = await Promise.all([
    getSectorLatest(id),
    getArtifact("run_cpo_leader_20260508"),
  ]);
  const leaderStocks = getLocalLeaderStocks();
  const { nodes: graphNodes, edges: graphEdges } = getLocalGraph();

  if (!sector) {
    return (
      <EmptyState
        title="板块不存在"
        message={error ?? `没有找到板块 ${id} 的最新数据。`}
        backHref="/analysis/market"
      />
    );
  }

  return (
    <main className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-6">
      <header className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">分析 / 板块 / {sector.id}</p>
          <h1 className="mt-2 text-2xl font-semibold">{sector.name}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {sector.asOf} · {sector.coverage} · 资金 {sector.fundFlow}
          </p>
        </div>
        <Button asChild>
          <Link href="/chat/thread_cpo">
            <MessageSquare aria-hidden="true" />
            在 Chat 中追问
          </Link>
        </Button>
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="border bg-card p-4">
          <p className="text-sm text-muted-foreground">涨跌</p>
          <p className="mt-2 text-2xl font-semibold text-destructive">+{sector.change.toFixed(2)}%</p>
        </div>
        <div className="border bg-card p-4">
          <p className="text-sm text-muted-foreground">热度</p>
          <p className="mt-2 text-2xl font-semibold">{sector.heat}</p>
        </div>
        <div className="border bg-card p-4">
          <p className="text-sm text-muted-foreground">龙头</p>
          <Link href={`/analysis/stock/${sector.leaderCode}`} className="mt-2 block text-2xl font-semibold text-primary">
            {sector.leader}
          </Link>
        </div>
        <div className="border bg-card p-4">
          <p className="text-sm text-muted-foreground">标签</p>
          <p className="mt-2 text-sm font-medium">{sector.tags.join(" / ")}</p>
        </div>
      </section>

      <section className="border bg-card p-5">
        <h2 className="text-base font-semibold">龙头榜</h2>
        <div className="mt-4 grid gap-3">
          {leaderStocks.map((stock, index) => (
            <article key={stock.code} className="border bg-background p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">#{index + 1} · {stock.code}</p>
                  <h3 className="mt-1 text-lg font-semibold">{stock.name}</h3>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-2xl font-semibold">{stock.score.toFixed(2)}</p>
                  <p className={stock.change >= 0 ? "text-sm text-destructive" : "text-sm text-emerald-700"}>
                    {stock.change > 0 ? "+" : ""}
                    {stock.change.toFixed(2)}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{stock.reason}</p>
              {index === 0 && (
                <div className="mt-4">
                  <ScoreRadar data={stock.scoreBreakdown} />
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      <RelationGraph nodes={graphNodes} edges={graphEdges} title="产业链图" />
      {artifact && <ArtifactCard artifact={artifact} compact />}
    </main>
  );
}
