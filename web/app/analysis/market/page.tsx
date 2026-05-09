import Link from "next/link";
import { MessageSquare } from "lucide-react";

import { SectorTable } from "@/components/features/sector-table";
import { Button } from "@/components/ui/button";
import { getMarketOverview } from "@/lib/app/api";

export default async function MarketAnalysisPage() {
  const {
    data: { sectors, events },
  } = await getMarketOverview();

  return (
    <main className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-6">
      <header className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">分析 / 大盘</p>
          <h1 className="mt-2 text-2xl font-semibold">大盘与热点</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            汇总指数宽度、资金热度和事件驱动，板块表按热度排序展示。
          </p>
        </div>
        <Button asChild>
          <Link href="/chat">
            <MessageSquare aria-hidden="true" />
            在 Chat 中追问
          </Link>
        </Button>
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        {[
          ["上涨家数", "3128", "市场宽度回升"],
          ["涨停", "64", "集中在算力链"],
          ["北向资金", "-42 亿", "接近观察阈值"],
          ["热点强度", "78", "科技风格占优"],
        ].map(([label, value, detail]) => (
          <div key={label} className="border bg-card p-4">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{value}</p>
            <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
          </div>
        ))}
      </section>

      <SectorTable sectors={sectors} />

      <section className="border bg-card p-5">
        <h2 className="text-base font-semibold">事件流</h2>
        <div className="mt-4 grid gap-3">
          {events.map((event) => (
            <Link key={event.id} href={`/analysis/event/${event.id}`} className="border bg-background p-4 hover:bg-accent">
              <p className="text-xs text-muted-foreground">
                {event.time} · {event.source}
              </p>
              <h3 className="mt-1 font-semibold">{event.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{event.summary}</p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
