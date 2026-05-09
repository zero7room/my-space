import Link from "next/link";

import { Button } from "@/components/ui/button";

export function EmptyState({
  title,
  message,
  backHref = "/",
}: {
  title: string;
  message: string;
  backHref?: string;
}) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-16">
      <p className="text-sm font-medium text-muted-foreground">未找到</p>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-sm leading-6 text-muted-foreground">{message}</p>
      <Button asChild className="w-fit" variant="outline">
        <Link href={backHref}>返回</Link>
      </Button>
    </main>
  );
}
