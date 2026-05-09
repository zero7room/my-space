import Link from "next/link";
import { ArrowRight, Eye, MessageSquare, Radar, Route } from "lucide-react";

import { AlertsPanel } from "@/components/features/alerts-panel";
import { Button } from "@/components/ui/button";
import { getAlerts, getLocalStocks, getMarketOverview, getStrategies } from "@/lib/app/api";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [
    { data: alerts },
    {
      data: { sectors },
    },
    { data: strategies },
  ] = await Promise.all([getAlerts(), getMarketOverview(), getStrategies()]);
  const stocks = getLocalStocks();
  const activeAlerts = alerts.filter((alert) => alert.state !== "deferred");
  const watchAlerts = alerts.filter((alert) => alert.state === "deferred");

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">沪深日终 · 美股盘前 · 2026-05-08</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal text-foreground">研究辅助工作台</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            今日要点、关注画像和持续观察集中在这里，提醒可以继续进入 Chat 或 Artifact 回看。
          </p>
        </div>
        <Button asChild>
          <Link href="/chat">
            <MessageSquare aria-hidden="true" />
            新建研究对话
          </Link>
        </Button>
      </header>

      <section className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <section className="border bg-card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">今日要点</h2>
              <p className="mt-1 text-sm text-muted-foreground">按时间倒序展示已命中的提醒。</p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="#alerts">提醒中心</Link>
            </Button>
          </div>

          <div className="mt-4 space-y-3">
            {activeAlerts.map((alert) => (
              <article key={alert.id} className="border bg-background p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">{alert.time} · {alert.trigger}</p>
                    <h3 className="mt-1 font-semibold">{alert.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{alert.context}</p>
                  </div>
                  <Button asChild size="sm" variant={alert.openChatThreadId ? "default" : "outline"}>
                    <Link href={alert.openChatThreadId ? `/chat/${alert.openChatThreadId}` : `/artifacts/${alert.artifactRunId}`}>
                      打开
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <aside className="grid gap-4">
          <section className="border bg-card p-5">
            <h2 className="text-base font-semibold">我关注的板块</h2>
            <div className="mt-4 grid gap-3">
              {sectors.slice(0, 3).map((sector) => (
                <Link key={sector.id} href={`/analysis/sector/${sector.id}`} className="border bg-background p-3 hover:bg-accent">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{sector.name}</span>
                    <span className={sector.change >= 0 ? "text-destructive" : "text-emerald-700"}>
                      {sector.change > 0 ? "+" : ""}
                      {sector.change.toFixed(2)}%
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">龙头：{sector.leader}</p>
                </Link>
              ))}
            </div>
          </section>

          <section className="border bg-card p-5">
            <h2 className="text-base font-semibold">我关注的个股</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {stocks.map((stock) => (
                <Button key={stock.code} asChild variant="outline" size="sm">
                  <Link href={`/analysis/stock/${stock.code}`}>{stock.name}</Link>
                </Button>
              ))}
            </div>
          </section>
        </aside>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <section className="border bg-card p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center border bg-accent text-accent-foreground">
              <Eye aria-hidden="true" className="size-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold">持续观察</h2>
              <p className="text-sm text-muted-foreground">仅展示可计算距离的阈值类策略。</p>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {watchAlerts.map((alert) => (
              <div key={alert.id} className="border bg-background p-3 text-sm">
                <p className="font-medium">{alert.title}</p>
                <p className="mt-1 text-muted-foreground">{alert.followUp}</p>
              </div>
            ))}
            {strategies
              .filter((strategy) => strategy.thresholdDistance)
              .map((strategy) => (
                <Link key={strategy.id} href={`/strategy/${strategy.id}`} className="block border bg-background p-3 text-sm hover:bg-accent">
                  <span className="font-medium">{strategy.name}</span>
                  <span className="mt-1 block text-muted-foreground">{strategy.thresholdDistance}</span>
                </Link>
              ))}
          </div>
        </section>

        <section className="border bg-card p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center border bg-secondary text-secondary-foreground">
              <Radar aria-hidden="true" className="size-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold">看板入口</h2>
              <p className="text-sm text-muted-foreground">大盘、板块、个股、事件和 Artifact 都可直接打开。</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Button asChild variant="outline" className="justify-start">
              <Link href="/analysis/market">大盘与热点</Link>
            </Button>
            <Button asChild variant="outline" className="justify-start">
              <Link href="/analysis/sector/BK_CPO">板块：光模块</Link>
            </Button>
            <Button asChild variant="outline" className="justify-start">
              <Link href="/analysis/event/EVT_NVDA_GUIDE">事件：英伟达传导</Link>
            </Button>
            <Button asChild variant="outline" className="justify-start">
              <Link href="/artifacts/run_cpo_leader_20260508">Artifact：龙头评分</Link>
            </Button>
            <Button asChild variant="outline" className="justify-start">
              <Link href="/strategy">策略工作台</Link>
            </Button>
            <Button asChild variant="outline" className="justify-start">
              <Link href="/strategy/skills">Skill 库</Link>
            </Button>
          </div>
        </section>
      </section>

      <section className="border bg-card p-5">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center border bg-background text-primary">
            <Route aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold">工作流地图</h2>
            <p className="text-sm text-muted-foreground">从提醒进入分析、Artifact、Chat，再凝固为策略。</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-5">
          {[
            ["提醒中心", "#alerts"],
            ["板块分析", "/analysis/sector/BK_CPO"],
            ["Artifact 回看", "/artifacts/run_cpo_leader_20260508"],
            ["Chat 追问", "/chat/thread_cpo"],
            ["保存策略", "/strategy?from_thread=thread_cpo"],
          ].map(([label, href], index) => (
            <Link key={label} href={href} className="border bg-background p-3 text-sm hover:bg-accent">
              <span className="text-xs text-muted-foreground">Step {index + 1}</span>
              <span className="mt-1 block font-medium">{label}</span>
            </Link>
          ))}
        </div>
      </section>

      <div id="alerts">
        <AlertsPanel alerts={alerts} />
      </div>
    </main>
  );
}
