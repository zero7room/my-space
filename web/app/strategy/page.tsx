import Link from "next/link";

import { ArtifactCard } from "@/components/features/artifact-card";
import { Button } from "@/components/ui/button";
import { getArtifact, getStrategies } from "@/lib/app/api";

export default async function StrategyPage({
  searchParams,
}: {
  searchParams: Promise<{ from_thread?: string }>;
}) {
  const { from_thread: fromThread } = await searchParams;
  const [{ data: strategies }, { data: artifact }] = await Promise.all([
    getStrategies(),
    getArtifact("run_cpo_leader_20260508"),
  ]);
  const draftDsl = strategies[0]?.dsl ?? "";

  return (
    <main className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-6">
      <header className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">策略</p>
          <h1 className="mt-2 text-2xl font-semibold">我的策略</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            管理规则驱动策略、查看命中历史，并从 Chat 上下文凝固为 DSL 草稿。
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/strategy/skills">Skill 库</Link>
        </Button>
      </header>

      {fromThread && (
        <section className="border bg-accent p-5 text-accent-foreground">
          <h2 className="text-base font-semibold">从 Chat 保存为策略</h2>
          <p className="mt-2 text-sm">已读取 thread `{fromThread}` 的最近提问和工具调用，生成 NL → DSL 草稿。</p>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-3">
          {strategies.map((strategy) => (
            <Link key={strategy.id} href={`/strategy/${strategy.id}`} className="block border bg-card p-4 hover:bg-accent">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{strategy.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    skill: {strategy.skill} · {strategy.schedule}
                  </p>
                </div>
                <span className="border bg-background px-2 py-1 text-xs">
                  {strategy.enabled ? "启用" : "暂停"}
                </span>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {strategy.status} · 7 日 {strategy.hitCount7d} 次
              </p>
            </Link>
          ))}
        </div>

        <section className="border bg-card p-5">
          <h2 className="text-base font-semibold">NL → DSL 创建表单</h2>
          <label className="mt-4 block text-sm font-medium" htmlFor="nl-rule">
            自然语言描述
          </label>
          <textarea
            id="nl-rule"
            defaultValue="光模块板块每天 9:35 跑龙头识别，综合分变化超 0.03 提醒我"
            className="mt-2 min-h-24 w-full border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="mt-4 border bg-background p-4">
            <p className="text-sm font-medium">DSL 草稿</p>
            <pre className="mt-3 overflow-auto whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{draftDsl}</pre>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button>确认启用</Button>
            <Button variant="outline">微调条件</Button>
          </div>
        </section>
      </section>

      {artifact && <ArtifactCard artifact={artifact} compact />}
    </main>
  );
}
