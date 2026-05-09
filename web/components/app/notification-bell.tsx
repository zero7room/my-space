"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { AlertSummary } from "@/lib/app/types";

export function NotificationBell({ alerts }: { alerts: AlertSummary[] }) {
  const [open, setOpen] = useState(false);
  const unread = alerts.filter((alert) => alert.priority === "high").length;

  return (
    <div className="relative">
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="打开提醒"
        onClick={() => setOpen((value) => !value)}
      >
        <Bell aria-hidden="true" />
      </Button>
      {unread > 0 && (
        <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center bg-destructive text-xs font-semibold text-destructive-foreground">
          {unread}
        </span>
      )}
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-[min(360px,calc(100vw-2rem))] border bg-popover p-3 shadow-lg">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">提醒</p>
            <Link className="text-xs text-primary hover:underline" href="/#alerts" onClick={() => setOpen(false)}>
              查看全部
            </Link>
          </div>
          <div className="mt-3 space-y-2">
            {alerts.slice(0, 3).map((alert) => (
              <Link
                key={alert.id}
                href={alert.openChatThreadId ? `/chat/${alert.openChatThreadId}` : `/artifacts/${alert.artifactRunId}`}
                className="block border bg-background p-3 text-sm hover:bg-accent"
                onClick={() => setOpen(false)}
              >
                <span className="text-xs text-muted-foreground">{alert.time}</span>
                <span className="mt-1 block font-medium">{alert.title}</span>
                <span className="mt-1 block text-muted-foreground">{alert.context}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
