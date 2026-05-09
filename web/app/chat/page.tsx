import { ChatWorkspace } from "@/components/features/chat-workspace";
import { EmptyState } from "@/components/features/empty-state";
import { getThread } from "@/lib/app/api";

export default async function ChatPage() {
  const { data: thread } = await getThread();

  if (!thread) {
    return <EmptyState title="暂无对话" message="还没有可用的研究对话。" />;
  }

  return <ChatWorkspace initialThread={thread} />;
}
