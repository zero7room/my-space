// packages/bot-runtime/src/ingress/webhook-handler.ts
import type { InboundEventRepo } from "../channel/inbound-event-repo.js";
import type { ProviderRegistry } from "../channel/provider-registry.js";
import type { NormalizedInbound } from "../channel/provider.js";
import { type Provider, ProviderSchema } from "../schema/channel.js";
import type { ThreadLoopResult } from "../thread-loop/thread-loop.js";

export type ConfigResolver = (provider: Provider) => Promise<{ secret: string } | null>;

export type BindingLookup = (
  provider: Provider,
  externalConversationId: string,
  externalConversationType: "dm" | "group" | "topic",
  externalUserId: string,
) => Promise<{ threadId: string; bound: boolean; userId: string } | null>;

export type IngestFn = (input: {
  threadId: string;
  messageId: string;
  fromUserId: string;
  source: "client" | "lark_private" | "lark_group" | "slack" | "wecom";
  bound: boolean;
  mentionsBot: boolean;
  replyToBotMessage: boolean;
  slashCommand: "confirm" | "cancel" | "status" | null;
  messageText: string;
  at: string;
}) => Promise<ThreadLoopResult>;

export type WebhookHandlerInput = {
  provider: string;
  headers: Record<string, string | string[] | undefined>;
  rawBody: Buffer;
};

export type WebhookHandlerResult = {
  status: number;
  body?: unknown;
};

export type WebhookHandler = (input: WebhookHandlerInput) => Promise<WebhookHandlerResult>;

function sourceFor(provider: string, type: NormalizedInbound["externalConversationType"]) {
  if (provider === "feishu") {
    return type === "dm" ? "lark_private" : "lark_group";
  }
  if (provider === "slack") return "slack";
  if (provider === "wecom") return "wecom";
  return "client";
}

export function createWebhookHandler(opts: {
  registry: ProviderRegistry;
  inboundRepo: InboundEventRepo;
  ingest: IngestFn;
  lookupBinding: BindingLookup;
  configResolver: ConfigResolver;
}): WebhookHandler {
  return async (req) => {
    // Parse at the boundary: unknown HTTP input → validated Provider union
    const parsedProvider = ProviderSchema.safeParse(req.provider);
    if (!parsedProvider.success) {
      return { status: 404, body: { error: "provider not registered" } };
    }
    const validProvider: Provider = parsedProvider.data;

    const providerImpl = opts.registry.get(validProvider);
    if (!providerImpl) return { status: 404, body: { error: "provider not registered" } };
    const cfg = await opts.configResolver(validProvider);
    if (!cfg) return { status: 412, body: { error: "provider not configured" } };

    const verified = await providerImpl.verifyInbound({
      headers: req.headers,
      rawBody: req.rawBody,
      secret: cfg.secret,
    });
    if (!verified.ok) {
      return { status: 401, body: { error: verified.reason } };
    }

    const decoded =
      "decoded" in verified && verified.decoded !== undefined
        ? verified.decoded
        : JSON.parse(req.rawBody.toString("utf8"));

    const challenge = (decoded as { challenge?: unknown })?.challenge;
    const type = (decoded as { type?: unknown })?.type;
    if (typeof challenge === "string" && type === "url_verification") {
      return { status: 200, body: { challenge } };
    }

    const normalized = await providerImpl.normalizeInbound(decoded);
    if (!normalized) return { status: 200, body: { ok: true } };

    if (await opts.inboundRepo.isDuplicate(validProvider, normalized.externalEventId)) {
      return { status: 200, body: { ok: true, duplicate: true } };
    }
    await opts.inboundRepo.recordReceived(validProvider, normalized.externalEventId, {
      ...(normalized.externalMessageId !== undefined && {
        externalMessageId: normalized.externalMessageId,
      }),
    });

    const binding = await opts.lookupBinding(
      validProvider,
      normalized.externalConversationId,
      normalized.externalConversationType,
      normalized.externalUserId,
    );
    if (!binding) {
      await opts.inboundRepo.markSkipped(validProvider, normalized.externalEventId, "no-binding");
      return { status: 200, body: { ok: true, skipped: "no-binding" } };
    }

    try {
      await opts.ingest({
        threadId: binding.threadId,
        messageId: normalized.externalMessageId ?? `ext-${normalized.externalEventId}`,
        fromUserId: binding.userId,
        source: sourceFor(validProvider, normalized.externalConversationType),
        bound: binding.bound,
        mentionsBot: normalized.mentionsBot,
        replyToBotMessage: normalized.replyToBotMessage,
        slashCommand: normalized.slashCommand,
        messageText: normalized.text,
        at: normalized.receivedAt,
      });
      await opts.inboundRepo.markProcessed(validProvider, normalized.externalEventId);
      return { status: 200, body: { ok: true } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await opts.inboundRepo.markFailed(validProvider, normalized.externalEventId, message);
      return { status: 500, body: { error: message } };
    }
  };
}
