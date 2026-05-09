import Link from "next/link";
import { MessageSquare } from "lucide-react";

import { ScoreRadar } from "@/components/charts/score-radar";
import { EmptyState } from "@/components/features/empty-state";
import { Button } from "@/components/ui/button";
import { getSymbolLatest } from "@/lib/app/api";

export default async function StockPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { data: stock, error } = await getSymbolLatest(code);

  if (!stock) {
    return (
      <EmptyState
        title="个股不存在"
        message={error ?? `没有找到个股 ${code} 的最新数据。`}
        backHref="/analysis/market"
      />
    );
  }

  return (
    <main className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-6">
      <header className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            分析 / 个股 / {stock.code} · 所属板块{" "}
            <Link href={`/analysis/sector/${stock.sectorId}`} className="text-primary hover:underline">
              {stock.sectorName}
            </Link>
          </p>
          <h1 className="mt-2 text-2xl font-semibold">{stock.name}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{stock.asOf} · {stock.longTermValue}</p>
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
          <p className="text-sm text-muted-foreground">价格</p>
          <p className="mt-2 text-2xl font-semibold">{stock.price.toFixed(2)}</p>
        </div>
        <div className="border bg-card p-4">
          <p className="text-sm text-muted-foreground">涨跌</p>
          <p className="mt-2 text-2xl font-semibold text-destructive">+{stock.change.toFixed(2)}%</p>
        </div>
        <div className="border bg-card p-4">
          <p className="text-sm text-muted-foreground">龙头评分</p>
          <p className="mt-2 text-2xl font-semibold">{stock.score.toFixed(2)}</p>
        </div>
        <div className="border bg-card p-4">
          <p className="text-sm text-muted-foreground">覆盖</p>
          <p className="mt-2 text-sm font-medium">5/5 维度可用</p>
        </div>
      </section>

      <section className="border bg-card p-5">
        <h2 className="text-base font-semibold">五维评分拆解</h2>
        <div className="mt-4">
          <ScoreRadar data={stock.scoreBreakdown} />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="border bg-card p-5">
          <h2 className="text-base font-semibold">入选原因</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {stock.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
        <div className="border bg-card p-5">
          <h2 className="text-base font-semibold">风险标签</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {stock.risks.map((risk) => (
              <span key={risk} className="border bg-background px-2 py-1 text-sm text-muted-foreground">
                {risk}
              </span>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
