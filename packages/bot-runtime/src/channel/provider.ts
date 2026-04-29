// packages/bot-runtime/src/channel/provider.ts
import type { InboundEvent } from "../thread-loop/thread-loop.js";

export type VerifyInboundResult = { ok: true; decoded?: unknown } | { ok: false; reason: string };

export type NormalizedInbound = {
  externalEventId: string;
  externalMessageId?: string;
  externalConversationId: string;
  externalConversationType: "dm" | "group" | "topic";
  externalUserId: string;
  text: string;
  mentionsBot: boolean;
  replyToBotMessage: boolean;
  slashCommand: "confirm" | "cancel" | "status" | null;
  receivedAt: string;
  raw: unknown;
};

export type SendMessageInput = {
  externalConversationId: string;
  text: string;
  importance: "info" | "milestone" | "alert";
  replyToExternalMessageId?: string;
};

export type SendMessageResult = {
  externalMessageId: string;
};

export type CreateConversationInput = {
  externalUserId?: string;
  topic?: string;
  type: "dm" | "group" | "topic";
};

export type CreateConversationResult = {
  externalConversationId: string;
};

export type ChannelProvider = {
  provider: string;
  verifyInbound(input: {
    headers: Record<string, string | string[] | undefined>;
    rawBody: Buffer;
    secret: string;
  }): Promise<VerifyInboundResult>;
  normalizeInbound(decoded: unknown): Promise<NormalizedInbound | null>;
  sendMessage(input: SendMessageInput): Promise<SendMessageResult>;
  createConversation(input: CreateConversationInput): Promise<CreateConversationResult>;
  deleteConversation(input: { externalConversationId: string }): Promise<void>;
};

export type InboundDispatch = Pick<
  InboundEvent,
  "messageId" | "fromUserId" | "source" | "text" | "at"
> & {
  bound: boolean;
  mentionsBot: boolean;
  replyToBotMessage: boolean;
  slashCommand: "confirm" | "cancel" | "status" | null;
  threadId: string;
};
