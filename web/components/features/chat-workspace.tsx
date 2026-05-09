"use client";

import Link from "next/link";
import { Bot, Pin, Save, Send, UserRound } from "lucide-react";
import { useMemo, useState } from "react";

import { ArtifactCard } from "@/components/features/artifact-card";
import { Button } from "@/components/ui/button";
import { getLocalArtifacts, getLocalThreads } from "@/lib/app/api";
import type { ChatMessage, ChatThread } from "@/lib/app/types";
import { cn } from "@/lib/utils";

export function ChatWorkspace({ initialThread }: { initialThread: ChatThread }) {
  const chatThreads = getLocalThreads();
  const artifacts = getLocalArtifacts();
  const [thread, setThread] = useState(initialThread);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);

  const saveHref = `/strategy?from_thread=${thread.id}`;

  const selectedThread = useMemo(
    () => chatThreads.find((item) => item.id === thread.id) ?? thread,
    [chatThreads, thread],
  );

  const sendMockMessage = () => {
    if (!input.trim() || streaming) {
      return;
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      time: "现在",
      content: input.trim(),
    };

    setThread((current) => ({ ...current, messages: [...current.messages, userMessage] }));
    setInput("");
    setStreaming(true);

    window.setTimeout(() => {
      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        time: "stream mock",
        content: "已读取当前 subject、最近 Artifact 和提醒上下文。结论会以 Artifact 卡片继续沉淀，便于后续保存为策略。",
        artifactRunId: "run_cpo_leader_20260508",
        trace: ["SSE mock: open", "tool-call: sector.latest", "tool-call: artifact.render"],
        tokenUsage: 734,
      };
      setThread((current) => ({ ...current, messages: [...current.messages, assistantMessage] }));
      setStreaming(false);
    }, 450);
  };

  return (
    <main className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-7xl gap-0 px-4 py-6 lg:grid-cols-[280px_1fr]">
      <aside className="border bg-card">
        <div className="border-b p-4">
          <Button className="w-full justify-start" onClick={() => setThread(chatThreads[0])}>
            新对话
          </Button>
        </div>
        <div className="divide-y">
          {chatThreads.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setThread(item)}
              className={cn(
                "block w-full px-4 py-3 text-left text-sm hover:bg-accent",
                selectedThread.id === item.id && "bg-accent",
              )}
            >
              <span className="flex items-center gap-2 font-medium">
                {item.pinned && <Pin aria-hidden="true" className="size-3" />}
                {item.title}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {item.tags.join(" / ")} · {item.updatedAt}
              </span>
            </button>
          ))}
        </div>
      </aside>

      <section className="flex min-h-[720px] flex-col border border-l-0 bg-background">
        <header className="flex flex-col gap-3 border-b bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Thread</p>
            <h1 className="text-xl font-semibold">{thread.title}</h1>
          </div>
          <Button asChild>
            <Link href={saveHref}>
              <Save aria-hidden="true" />
              保存为策略
            </Link>
          </Button>
        </header>

        <div className="flex-1 space-y-4 overflow-auto p-4">
          {thread.messages.map((message) => (
            <MessageBubble key={message.id} message={message} artifacts={artifacts} />
          ))}
          {streaming && (
            <div className="border bg-card p-4 text-sm text-muted-foreground" aria-live="polite">
              正在流式生成回答...
            </div>
          )}
        </div>

        <div className="border-t bg-card p-4">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  sendMockMessage();
                }
              }}
              className="h-11 flex-1 border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              placeholder="输入研究问题，或 /skill 龙头识别"
            />
            <Button type="button" onClick={sendMockMessage}>
              <Send aria-hidden="true" />
              发送
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}

function MessageBubble({
  message,
  artifacts,
}: {
  message: ChatMessage;
  artifacts: ReturnType<typeof getLocalArtifacts>;
}) {
  const artifact = artifacts.find((item) => item.runId === message.artifactRunId);
  const isUser = message.role === "user";

  return (
    <article className={cn("grid gap-3", isUser && "justify-items-end")}>
      <div className={cn("max-w-3xl border p-4", isUser ? "bg-primary text-primary-foreground" : "bg-card")}>
        <div className="flex items-center gap-2 text-xs opacity-80">
          {isUser ? <UserRound aria-hidden="true" className="size-3" /> : <Bot aria-hidden="true" className="size-3" />}
          <span>{message.role}</span>
          <span>{message.time}</span>
        </div>
        <p className="mt-2 text-sm leading-6">{message.content}</p>
        {message.trace && (
          <details className="mt-3 text-sm" data-testid={`trace-${message.id}`}>
            <summary className="cursor-pointer">tool-call trace</summary>
            <ul className="mt-2 space-y-1 opacity-80">
              {message.trace.map((trace) => (
                <li key={trace}>{trace}</li>
              ))}
            </ul>
            {message.tokenUsage && <p className="mt-2 opacity-80">token 用量：{message.tokenUsage}</p>}
          </details>
        )}
      </div>
      {artifact && (
        <div className="w-full max-w-3xl">
          <ArtifactCard artifact={artifact} compact />
        </div>
      )}
    </article>
  );
}
