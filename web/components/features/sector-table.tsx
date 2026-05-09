"use client";

import Link from "next/link";
import { ArrowUpDown, Filter } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import type { SectorSummary } from "@/lib/app/types";

export function SectorTable({ sectors }: { sectors: SectorSummary[] }) {
  const [sort, setSort] = useState<"heat" | "change">("heat");
  const [filter, setFilter] = useState<"all" | "positive" | "negative">("all");

  const sorted = useMemo(() => {
    return sectors
      .filter((sector) => {
        if (filter === "positive") {
          return sector.change >= 0;
        }
        if (filter === "negative") {
          return sector.change < 0;
        }
        return true;
      })
      .sort((a, b) => (sort === "heat" ? b.heat - a.heat : b.change - a.change));
  }, [filter, sectors, sort]);

  return (
    <div className="border bg-card">
      <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">板块总览</h2>
          <p className="text-sm text-muted-foreground">滚动表格支持排序、筛选和板块跳转。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={sort === "heat" ? "default" : "outline"}
            size="sm"
            onClick={() => setSort("heat")}
          >
            <ArrowUpDown aria-hidden="true" />
            热度
          </Button>
          <Button
            type="button"
            variant={sort === "change" ? "default" : "outline"}
            size="sm"
            onClick={() => setSort("change")}
          >
            <ArrowUpDown aria-hidden="true" />
            涨跌
          </Button>
          <Button
            type="button"
            variant={filter === "all" ? "secondary" : "outline"}
            size="sm"
            onClick={() => setFilter("all")}
          >
            <Filter aria-hidden="true" />
            全部
          </Button>
          <Button
            type="button"
            variant={filter === "positive" ? "secondary" : "outline"}
            size="sm"
            onClick={() => setFilter("positive")}
          >
            上涨
          </Button>
          <Button
            type="button"
            variant={filter === "negative" ? "secondary" : "outline"}
            size="sm"
            onClick={() => setFilter("negative")}
          >
            下跌
          </Button>
        </div>
      </div>
      <div className="border-b bg-background px-4 py-2 text-xs text-muted-foreground">
        当前显示 {sorted.length} / {sectors.length} 个板块
      </div>
      <div className="max-h-[420px] overflow-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead className="sticky top-0 bg-muted text-left">
            <tr>
              <th className="px-4 py-3 font-medium">板块</th>
              <th className="px-4 py-3 font-medium">涨跌</th>
              <th className="px-4 py-3 font-medium">热度</th>
              <th className="px-4 py-3 font-medium">资金</th>
              <th className="px-4 py-3 font-medium">龙头摘要</th>
              <th className="px-4 py-3 font-medium">覆盖</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((sector) => (
              <tr key={sector.id} className="border-t">
                <td className="px-4 py-3">
                  <Link className="font-medium text-primary hover:underline" href={`/analysis/sector/${sector.id}`}>
                    {sector.name}
                  </Link>
                  <div className="mt-1 flex gap-1">
                    {sector.tags.slice(0, 2).map((tag) => (
                      <span key={tag} className="bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground">
                        {tag}
                      </span>
                    ))}
                  </div>
                </td>
                <td className={sector.change >= 0 ? "px-4 py-3 text-destructive" : "px-4 py-3 text-emerald-700"}>
                  {sector.change > 0 ? "+" : ""}
                  {sector.change.toFixed(2)}%
                </td>
                <td className="px-4 py-3">{sector.heat}</td>
                <td className="px-4 py-3">{sector.fundFlow}</td>
                <td className="px-4 py-3">
                  <Link className="text-primary hover:underline" href={`/analysis/stock/${sector.leaderCode}`}>
                    {sector.leader}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{sector.coverage}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
