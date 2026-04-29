import type { CreateConversationInput, CreateConversationResult } from "../../channel/provider.js";

const FEISHU_HOST = "https://open.feishu.cn";

export async function feishuCreateConversation(
  ctx: { tenantAccessToken: string },
  input: CreateConversationInput,
): Promise<CreateConversationResult> {
  if (input.type === "dm") {
    if (!input.externalUserId) throw new Error("dm requires externalUserId");
    const res = await fetch(
      `${FEISHU_HOST}/open-apis/im/v1/chats/p2p?user_id_type=open_id&user_id=${encodeURIComponent(
        input.externalUserId,
      )}`,
      { headers: { Authorization: `Bearer ${ctx.tenantAccessToken}` } },
    );
    if (!res.ok) throw new Error(`feishu p2p HTTP ${res.status}`);
    const json = (await res.json()) as { code?: number; data?: { chat_id?: string } };
    if (json.code !== 0 || !json.data?.chat_id) {
      throw new Error(`feishu p2p code=${json.code}`);
    }
    return { externalConversationId: json.data.chat_id };
  }

  const body: Record<string, unknown> = { name: input.topic ?? "AI Employee task" };
  const res = await fetch(`${FEISHU_HOST}/open-apis/im/v1/chats`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ctx.tenantAccessToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`feishu create_chat HTTP ${res.status}`);
  const json = (await res.json()) as { code?: number; data?: { chat_id?: string } };
  if (json.code !== 0 || !json.data?.chat_id) {
    throw new Error(`feishu create_chat code=${json.code}`);
  }
  return { externalConversationId: json.data.chat_id };
}
