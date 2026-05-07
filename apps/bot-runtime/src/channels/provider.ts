/**
 * ChannelProvider abstraction. Each channel type (feishu, slack, wecom, ...)
 * implements this interface. The runtime composes:
 *   - inbound webhook handler (signature verify + idempotency + record)
 *   - outbound job processor (consume jobs/pending → run provider → move to
 *     done|failed|dead, with backoff)
 *   - bind / unbind helpers via API routes.
 */
import type {
  ChannelInboundEvent,
  ChannelJob,
} from '@ai-workflow/contracts';

export interface InboundContext {
  /** Raw POST body. */
  body: unknown;
  /** Provider-specific signature header (e.g. X-Lark-Request-Signature). */
  signatureHeader?: string;
  /** Provider-specific timestamp header. */
  timestampHeader?: string;
  /** Raw bytes for HMAC if signing requires them. */
  rawBody?: Buffer;
}

export interface InboundOutcome {
  /** True if the signature passed; false should drop without recording. */
  signatureValid: boolean;
  /** Idempotency key extracted from the payload (e.g. event_id). */
  idempotencyKey?: string;
  /** Optional structured event to record. */
  event?: ChannelInboundEvent;
  /** Optional handoff to ThreadLoop (text + identities). */
  ingestedMessage?: {
    externalConversationId: string;
    externalMessageId?: string;
    text: string;
    fromExternalUserId?: string;
  };
}

export interface OutboundContext {
  job: ChannelJob;
}

export interface OutboundOutcome {
  status: 'succeeded' | 'failed';
  result?: Record<string, unknown>;
  error?: string;
}

export interface ChannelProvider {
  readonly name: string;
  /**
   * Verify and parse an inbound webhook payload.
   * Implementations MUST verify HMAC signature when configured.
   */
  handleInbound(input: InboundContext): Promise<InboundOutcome>;
  /**
   * Send an outbound job (e.g. send_message, create_conversation).
   * Implementations MUST be idempotent given the same dedupeKey.
   */
  handleOutbound(input: OutboundContext): Promise<OutboundOutcome>;
}
