import type { SendMessageInput, SendMessageResult } from "../../channel/provider.js";

const FEISHU_HOST = "https://open.feishu.cn";

function importancePrefix(importance: SendMessageInput["importance"]): string {
  switch (importance) {
    case "milestone":
      return "[milestone] ";
    case "alert":
      return "[alert] ";
    default:
      return "";
  }
}

function receiveIdType(externalConversationId: string): string {
  if (externalConversationId.startsWith("oc_")) return "chat_id";
  if (externalConversationId.startsWith("ou_")) return "open_id";
  if (externalConversationId.startsWith("on_")) return "open_chat_id";
  return "chat_id";
}

export async function feishuSendMessage(
  ctx: { tenantAccessToken: string },
  input: SendMessageInput,
): Promise<SendMessageResult> {
  const url = `${FEISHU_HOST}/open-apis/im/v1/messages?receive_id_type=${receiveIdType(
    input.externalConversationId,
  )}`;
  const body = {
    receive_id: input.externalConversationId,
    msg_type: "text",
    content: JSON.stringify({ text: importancePrefix(input.importance) + input.text }),
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ctx.tenantAccessToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`feishu send_message HTTP ${res.status}: ${text}`);
  }
  const json = (await res.json()) as {
    code?: number;
    msg?: string;
    data?: { message_id?: string };
  };
  if (json.code !== 0) {
    throw new Error(`feishu send_message code=${json.code} msg=${json.msg}`);
  }
  if (!json.data?.message_id) {
    throw new Error("feishu send_message missing data.message_id");
  }
  return { externalMessageId: json.data.message_id };
}
