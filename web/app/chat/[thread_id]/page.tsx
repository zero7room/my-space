import { ChatWorkspace } from "@/components/features/chat-workspace";
import { EmptyState } from "@/components/features/empty-state";
import { getThread } from "@/lib/app/api";

export default async function ChatThreadPage({ params }: { params: Promise<{ thread_id: string }> }) {
  const { thread_id: threadId } = await params;
  const { data: thread, error } = await getThread(threadId);

  if (!thread) {
    return (
      <EmptyState
        title="对话不存在"
        message={error ?? `没有找到对话 ${threadId}。`}
        backHref="/chat"
      />
    );
  }

  return <ChatWorkspace initialThread={thread} />;
}
