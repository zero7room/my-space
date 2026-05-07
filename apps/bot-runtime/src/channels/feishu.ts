/**
 * Feishu (Lark) channel provider. v1 implements:
 *   - HMAC verify of inbound webhook when an `encryptKey` is configured.
 *   - Verification-token check otherwise.
 *   - Inbound parsing into ingestedMessage for ThreadLoop.
 *   - Outbound stub that returns succeeded for v1 (real Lark API call slot).
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { newChannelEventId } from '@ai-workflow/contracts';

import type {
  ChannelProvider,
  InboundContext,
  InboundOutcome,
  OutboundContext,
  OutboundOutcome,
} from './provider.js';

export interface FeishuConfig {
  verificationToken?: string;
  encryptKey?: string;
}

export class FeishuProvider implements ChannelProvider {
  readonly name = 'feishu';
  constructor(private readonly cfg: FeishuConfig = {}) {}

  async handleInbound(input: InboundContext): Promise<InboundOutcome> {
    if (this.cfg.encryptKey) {
      if (!input.signatureHeader || !input.timestampHeader) {
        return { signatureValid: false };
      }
      const ok = verifyFeishuHmac(
        this.cfg.encryptKey,
        input.timestampHeader,
        input.rawBody,
        input.signatureHeader,
      );
      if (!ok) return { signatureValid: false };
    }

    const body = input.body as
      | {
          token?: string;
          header?: { event_id?: string; event_type?: string };
          event?: {
            message?: {
              chat_id?: string;
              message_id?: string;
              content?: string;
              chat_type?: string;
            };
            sender?: { sender_id?: { open_id?: string } };
          };
        }
      | undefined;
    if (!body) return { signatureValid: false };

    if (this.cfg.verificationToken && body.token !== this.cfg.verificationToken) {
      return { signatureValid: false };
    }

    const eventId = body.header?.event_id;
    if (!eventId) return { signatureValid: false };

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
    return {
      signatureValid: true,
      idempotencyKey: eventId,
      event,
      ingestedMessage,
    };
  }

  async handleOutbound(_input: OutboundContext): Promise<OutboundOutcome> {
    return { status: 'succeeded', result: { delivered: true } };
  }
}

/**
 * Accepts either:
 *   - HMAC-SHA256(encryptKey, `${timestamp}${rawBody}`) → hex (modern Lark)
 *   - SHA256(`${timestamp}${nonce}${encryptKey}`)       → hex (legacy challenge)
 * Constant-time compared; either matching produces `true`.
 */
export function verifyFeishuHmac(
  encryptKey: string,
  timestamp: string,
  rawBody: Buffer | undefined,
  signatureHex: string,
): boolean {
  const bodyStr = (rawBody ?? Buffer.alloc(0)).toString('utf8');
  const hmac = createHmac('sha256', encryptKey)
    .update(`${timestamp}${bodyStr}`)
    .digest('hex');
  if (constantTimeEq(hmac, signatureHex)) return true;
  const legacy = createHash('sha256')
    .update(`${timestamp}${bodyStr}${encryptKey}`)
    .digest('hex');
  return constantTimeEq(legacy, signatureHex);
}

function constantTimeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

/** Backward-compat helper kept for existing callers. */
export function feishuSignatureValid(
  encryptKey: string,
  timestamp: string,
  nonce: string,
  expected: string,
): boolean {
  const h = createHash('sha256')
    .update(`${timestamp}${nonce}${encryptKey}`)
    .digest('hex');
  return constantTimeEq(h, expected);
}
