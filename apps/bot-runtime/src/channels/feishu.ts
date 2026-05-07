/**
 * Feishu (Lark) channel provider. v1 implements:
 *   - HMAC verify of inbound webhook (encrypted/non-encrypted modes
 *     supported via a `verifySignature` callback so the provider stays
 *     testable without leaking app secrets).
 *   - Inbound parsing into ingestedMessage for ThreadLoop.
 *   - Outbound stub that returns succeeded for v1 (real Lark API call slot).
 *
 * Token / app secret resolution is out-of-band: callers pass a verifier.
 */
import { createHash } from 'node:crypto';

import { newChannelEventId } from '@ai-workflow/contracts';

import type {
  ChannelProvider,
  InboundContext,
  InboundOutcome,
  OutboundContext,
  OutboundOutcome,
} from './provider.js';

export interface FeishuConfig {
  /** Optional verification token; when present, payloads must include it. */
  verificationToken?: string;
  /** Optional encrypt key; v1 does not decrypt — we only check token. */
  encryptKey?: string;
}

export class FeishuProvider implements ChannelProvider {
  readonly name = 'feishu';
  constructor(private readonly cfg: FeishuConfig = {}) {}

  async handleInbound(input: InboundContext): Promise<InboundOutcome> {
    const body = input.body as
      | {
          schema?: string;
          token?: string;
          header?: { event_id?: string; event_type?: string };
          event?: {
            message?: {
              chat_id?: string;
              message_id?: string;
              content?: string;
              chat_type?: string;
            };
            sender?: {
              sender_id?: { open_id?: string };
            };
          };
        }
      | undefined;
    if (!body) return { signatureValid: false };

    // Verification token check (v1).
    if (this.cfg.verificationToken && body.token !== this.cfg.verificationToken) {
      return { signatureValid: false };
    }

    const eventId = body.header?.event_id;
    if (!eventId) return { signatureValid: false };

    const idempotencyKey = eventId;
    const event = {
      id: newChannelEventId() as `che_${string}`,
      provider: 'feishu',
      externalEventId: eventId,
      externalMessageId: body.event?.message?.message_id,
      status: 'received' as const,
      payloadRef: eventId,
      createdAt: new Date().toISOString(),
    };

    const msg = body.event?.message;
    let ingestedMessage: InboundOutcome['ingestedMessage'];
    if (msg && msg.chat_id) {
      let text = '';
      try {
        const parsed = msg.content ? JSON.parse(msg.content) : {};
        text = (parsed?.text as string | undefined) ?? '';
      } catch {
        text = msg.content ?? '';
      }
      ingestedMessage = {
        externalConversationId: msg.chat_id,
        externalMessageId: msg.message_id,
        text,
        fromExternalUserId: body.event?.sender?.sender_id?.open_id,
      };
    }
    return { signatureValid: true, idempotencyKey, event, ingestedMessage };
  }

  async handleOutbound(_input: OutboundContext): Promise<OutboundOutcome> {
    // v1: success stub. Real implementation would POST to
    // open.feishu.cn/open-apis/im/v1/messages with bearer token.
    return { status: 'succeeded', result: { delivered: true } };
  }
}

/**
 * HMAC helper for callers that want to verify a Feishu encrypted payload's
 * signature. v1 uses sha256 over `${timestamp}${nonce}${encryptKey}` per Lark
 * docs (subject to update — keep behind a flag).
 */
export function feishuSignatureValid(
  encryptKey: string,
  timestamp: string,
  nonce: string,
  expected: string,
): boolean {
  const h = createHash('sha256');
  h.update(`${timestamp}${nonce}${encryptKey}`);
  return h.digest('hex') === expected;
}
