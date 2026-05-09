import Link from "next/link";
import { Activity, BarChart3, Bell, Bot, Settings } from "lucide-react";
import type { ReactNode } from "react";

import { CommandMenu } from "@/components/app/command-menu";
import { NotificationBell } from "@/components/app/notification-bell";
import { Button } from "@/components/ui/button";
import { getAlerts, getCommandItems } from "@/lib/app/api";

const navItems = [
  { href: "/", label: "主页" },
  { href: "/chat", label: "Chat" },
  { href: "/analysis/market", label: "分析" },
  { href: "/strategy", label: "策略" },
];

export async function AppShell({ children }: { children: ReactNode }) {
  const [{ data: alerts }, { data: commandItems }] = await Promise.all([
    getAlerts(),
    getCommandItems(),
  ]);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 w-full max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="flex size-9 items-center justify-center border bg-primary text-primary-foreground">
              <Activity aria-hidden="true" className="size-4" />
            </span>
            <span>My Space</span>
          </Link>
          <nav className="flex items-center gap-1">
            {navItems.map((item) => (
              <Button key={item.href} asChild variant="ghost" size="sm">
                <Link href={item.href}>{item.label}</Link>
              </Button>
            ))}
            <Button asChild variant="ghost" size="sm" className="hidden lg:inline-flex">
              <Link href="/analysis/sector/BK_CPO">
                <BarChart3 aria-hidden="true" />
                光模块
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="hidden lg:inline-flex">
              <Link href="/strategy/skills">
                <Bot aria-hidden="true" />
                Skill
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="hidden lg:inline-flex">
              <Link href="/#alerts">
                <Bell aria-hidden="true" />
                提醒
              </Link>
            </Button>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <CommandMenu items={commandItems} />
            <NotificationBell alerts={alerts} />
            <Button variant="ghost" size="icon" aria-label="设置">
              <Settings aria-hidden="true" />
            </Button>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
