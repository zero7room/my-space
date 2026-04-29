import type { NormalizedInbound } from "../../channel/provider.js";

type FeishuEnvelope = {
  schema?: string;
  header?: {
    event_id?: string;
    event_type?: string;
    create_time?: string;
  };
  event?: {
    sender?: { sender_id?: { open_id?: string } };
    message?: {
      message_id?: string;
      message_type?: string;
      chat_id?: string;
      chat_type?: string;
      content?: string;
      mentions?: Array<{ id?: { open_id?: string }; name?: string }>;
      parent_id?: string;
      root_id?: string;
    };
    reply?: { message_id?: string; sender_open_id?: string };
  };
};

const SLASH_RE = /\/(confirm|cancel|status)\b/i;

function stripMentions(text: string): string {
  return text.replace(/<at user_id="[^"]+">[^<]*<\/at>/g, "").trim();
}

export type NormalizeOptions = {
  botOpenId: string;
};

export async function normalizeFeishuInbound(
  raw: unknown,
  opts: NormalizeOptions,
): Promise<NormalizedInbound | null> {
  const env = raw as FeishuEnvelope;
  if (env.header?.event_type !== "im.message.receive_v1") return null;
  const msg = env.event?.message;
  const sender = env.event?.sender?.sender_id?.open_id;
  if (!msg || !sender || msg.message_type !== "text") return null;

  let parsedContent: { text?: string };
  try {
    parsedContent = JSON.parse(msg.content ?? "{}") as { text?: string };
  } catch {
    return null;
  }
  const rawText = parsedContent.text ?? "";
  const text = stripMentions(rawText) || rawText;

  const mentionsBot = Boolean(msg.mentions?.some((m) => m.id?.open_id === opts.botOpenId));

  const replyToBotMessage = Boolean(
    env.event?.reply?.sender_open_id && env.event.reply.sender_open_id === opts.botOpenId,
  );

  const slashMatch = text.match(SLASH_RE);
  const slashMatchValue = slashMatch?.[1];
  const slashCommand = slashMatchValue
    ? (slashMatchValue.toLowerCase() as "confirm" | "cancel" | "status")
    : null;

  const chatTypeRaw = msg.chat_type ?? "p2p";
  const externalConversationType: "dm" | "group" | "topic" = chatTypeRaw === "p2p" ? "dm" : "group";

  const createTimeMs = Number(env.header?.create_time ?? Date.now());
  const receivedAt = new Date(
    Number.isFinite(createTimeMs) ? createTimeMs : Date.now(),
  ).toISOString();

  return {
    externalEventId: env.header?.event_id ?? "",
    ...(msg.message_id !== undefined && { externalMessageId: msg.message_id }),
    externalConversationId: msg.chat_id ?? "",
    externalConversationType,
    externalUserId: sender,
    text,
    mentionsBot,
    replyToBotMessage,
    slashCommand,
    receivedAt,
    raw,
  };
}
