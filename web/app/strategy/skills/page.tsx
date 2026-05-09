import Link from "next/link";

import { Button } from "@/components/ui/button";
import { getSkills } from "@/lib/app/api";

export default async function SkillLibraryPage() {
  const { data: skills } = await getSkills();

  return (
    <main className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-6">
      <header className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">策略 / Skill 库</p>
          <h1 className="mt-2 text-2xl font-semibold">Skill 库</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            系统内置 Skill 的启用状态、调用统计和输入输出 schema 摘要。
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/strategy">我的策略</Link>
        </Button>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        {skills.map((skill) => (
          <article key={skill.id} className="border bg-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{skill.name}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{skill.description}</p>
              </div>
              <span className="border bg-background px-2 py-1 text-xs">
                {skill.enabled ? "启用" : "停用"}
              </span>
            </div>
            <dl className="mt-4 grid gap-2 text-sm">
              <div>
                <dt className="text-muted-foreground">Schema</dt>
                <dd className="font-medium">{skill.schema}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">策略引用</dt>
                <dd className="font-medium">{skill.strategyRefs}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">最近调用</dt>
                <dd className="font-medium">{skill.lastRun}</dd>
              </div>
            </dl>
            <Button asChild className="mt-4 w-full" variant="outline">
              <Link href="/chat">在 Chat 中试用</Link>
            </Button>
          </article>
        ))}
      </section>
    </main>
  );
}
