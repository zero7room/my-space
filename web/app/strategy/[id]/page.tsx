import Link from "next/link";

import { AlertsPanel } from "@/components/features/alerts-panel";
import { ArtifactCard } from "@/components/features/artifact-card";
import { EmptyState } from "@/components/features/empty-state";
import { Button } from "@/components/ui/button";
import { getAlerts, getArtifact, getStrategy } from "@/lib/app/api";

export default async function StrategyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: strategy, error } = await getStrategy(id);

  if (!strategy) {
    return (
      <EmptyState
        title="策略不存在"
        message={error ?? `没有找到策略 ${id}。`}
        backHref="/strategy"
      />
    );
  }

  const [{ data: strategyAlerts }, { data: recentArtifact }] = await Promise.all([
    getAlerts(strategy.id),
    strategy.recentArtifactRunId
      ? getArtifact(strategy.recentArtifactRunId)
      : Promise.resolve({ data: null }),
  ]);

  return (
    <main className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-6">
      <header className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">策略 / {strategy.id}</p>
          <h1 className="mt-2 text-2xl font-semibold">{strategy.name}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {strategy.skill} · {strategy.schedule} · {strategy.status}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/strategy">返回策略列表</Link>
        </Button>
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="border bg-card p-4">
          <p className="text-sm text-muted-foreground">状态</p>
          <p className="mt-2 text-2xl font-semibold">{strategy.enabled ? "启用" : "暂停"}</p>
        </div>
        <div className="border bg-card p-4">
          <p className="text-sm text-muted-foreground">今日命中</p>
          <p className="mt-2 text-2xl font-semibold">{strategy.hitCountToday}</p>
        </div>
        <div className="border bg-card p-4">
          <p className="text-sm text-muted-foreground">7 日命中</p>
          <p className="mt-2 text-2xl font-semibold">{strategy.hitCount7d}</p>
        </div>
        <div className="border bg-card p-4">
          <p className="text-sm text-muted-foreground">距离</p>
          <p className="mt-2 text-sm font-medium">{strategy.thresholdDistance ?? "已命中"}</p>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="border bg-card p-5">
          <h2 className="text-base font-semibold">DSL</h2>
          <pre className="mt-3 overflow-auto whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{strategy.dsl}</pre>
        </div>
        {recentArtifact && <ArtifactCard artifact={recentArtifact} compact />}
      </section>

      <AlertsPanel alerts={strategyAlerts} />
    </main>
  );
}
