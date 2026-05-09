"use client";

import Link from "next/link";
import { Check, Star } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import type { AlertState, AlertSummary, Priority } from "@/lib/app/types";
import { cn } from "@/lib/utils";

const priorityText: Record<Priority, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

const stateText: Record<AlertState, string> = {
  new: "未读",
  read: "已读",
  archived: "归档",
  active: "未读",
  sent: "已读",
  merged: "归档",
  deferred: "观察",
};

const priorityFilters: Array<{ value: Priority | "all"; label: string }> = [
  { value: "all", label: "全部" },
  { value: "high", label: "高" },
  { value: "medium", label: "中" },
  { value: "low", label: "低" },
];

export function AlertsPanel({ alerts }: { alerts: AlertSummary[] }) {
  const [priority, setPriority] = useState<Priority | "all">("all");
  const [readIds, setReadIds] = useState<Set<string>>(
    () => new Set(alerts.filter((alert) => alert.state === "read" || alert.state === "sent").map((alert) => alert.id)),
  );
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

  const filteredAlerts = useMemo(
    () => alerts.filter((alert) => priority === "all" || alert.priority === priority),
    [alerts, priority],
  );

  const toggleSet = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    return next;
  };

  return (
    <section className="border bg-card p-5" aria-label="提醒中心">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">提醒中心</h2>
          <p className="mt-1 text-sm text-muted-foreground">上下文、证据与后续走势集中回看。</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/">回主页</Link>
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2" aria-label="优先级过滤">
        {priorityFilters.map((item) => (
          <Button
            key={item.value}
            type="button"
            variant={priority === item.value ? "default" : "outline"}
            size="sm"
            onClick={() => setPriority(item.value)}
          >
            {item.label}
          </Button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {filteredAlerts.length === 0 && (
          <div className="border bg-background p-4 text-sm text-muted-foreground">
            当前过滤条件下暂无提醒。
          </div>
        )}

        {filteredAlerts.map((alert) => {
          const isRead = readIds.has(alert.id);
          const isFavorite = favoriteIds.has(alert.id);

          return (
          <article key={alert.id} className="border bg-background p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  {alert.time} · {priorityText[alert.priority]}优先级 · {isRead ? "已读" : stateText[alert.state]}
                </p>
                <h3 className={cn("mt-1 font-semibold", isRead && "text-muted-foreground")}>
                  {alert.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{alert.context}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={isRead ? "outline" : "secondary"}
                  onClick={() => setReadIds((current) => toggleSet(current, alert.id))}
                >
                  <Check aria-hidden="true" />
                  {isRead ? "标为未读" : "标为已读"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={isFavorite ? "default" : "outline"}
                  onClick={() => setFavoriteIds((current) => toggleSet(current, alert.id))}
                >
                  <Star aria-hidden="true" />
                  {isFavorite ? "已收藏" : "收藏"}
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/artifacts/${alert.artifactRunId}`}>Artifact</Link>
                </Button>
                {alert.openChatThreadId && (
                  <Button asChild size="sm">
                    <Link href={`/chat/${alert.openChatThreadId}`}>Chat</Link>
                  </Button>
                )}
              </div>
            </div>
            <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
              <div className="border bg-card p-3">
                <p className="font-medium">触发原因</p>
                <p className="mt-1 text-muted-foreground">{alert.trigger}</p>
              </div>
              <div className="border bg-card p-3">
                <p className="font-medium">后续走势</p>
                <div className="mt-2 h-10 bg-[linear-gradient(90deg,var(--color-muted)_20%,var(--color-accent)_20%,var(--color-accent)_48%,var(--color-primary)_48%,var(--color-primary)_72%,var(--color-muted)_72%)]" />
                <p className="mt-2 text-muted-foreground">{alert.followUp}</p>
              </div>
            </div>
          </article>
          );
        })}
      </div>
    </section>
  );
}
