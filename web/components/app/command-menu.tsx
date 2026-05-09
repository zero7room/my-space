"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import type { CommandItem } from "@/lib/app/types";

export function CommandMenu({ items }: { items: CommandItem[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return items;
    }

    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(normalized) ||
        item.description.toLowerCase().includes(normalized),
    );
  }, [items, query]);

  return (
    <>
      <Button type="button" variant="outline" className="hidden min-w-44 justify-start sm:inline-flex" onClick={() => setOpen(true)}>
        <Search aria-hidden="true" />
        Cmd+K
      </Button>
      <Button type="button" variant="outline" size="icon" aria-label="打开命令栏" className="sm:hidden" onClick={() => setOpen(true)}>
        <Search aria-hidden="true" />
      </Button>

      {open && (
        <div className="fixed inset-0 z-40 bg-foreground/20 p-4" role="presentation" onMouseDown={() => setOpen(false)}>
          <div
            className="mx-auto mt-20 w-full max-w-xl border bg-popover p-3 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-label="全局命令栏"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-2 border px-3">
              <Search aria-hidden="true" className="size-4 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索板块、个股、事件或 Artifact"
                className="h-11 flex-1 bg-transparent text-sm outline-none"
              />
            </div>
            <div className="mt-3 max-h-80 overflow-auto">
              {filtered.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="block border-b px-3 py-3 text-sm last:border-b-0 hover:bg-accent"
                  onClick={() => setOpen(false)}
                >
                  <span className="font-medium">{item.label}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{item.group}</span>
                  <span className="mt-1 block text-muted-foreground">{item.description}</span>
                </Link>
              ))}
              {filtered.length === 0 && <p className="px-3 py-8 text-center text-sm text-muted-foreground">没有匹配结果</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
