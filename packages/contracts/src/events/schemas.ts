/**
 * Durable event envelope and SSE fan-out shape.
 *
 * Every event has a monotonic `seq` (per-stream), an `id` (`ev_<nanoid>`), an
 * optional `txId` if it was written inside a file-level transaction, and a
 * payload typed per `kind`. The payload union is intentionally permissive at
 * this layer — runtime emitters refine via narrower types at call sites.
 */
import { z } from 'zod';

import { idString, isoTimestamp } from '../schemas.js';

import { ALL_EVENT_KINDS } from './kinds.js';

export const eventEnvelopeSchema = z
  .object({
    id: idString,
    seq: z.number().int().nonnegative(),
    kind: z.enum(ALL_EVENT_KINDS),
    txId: idString.optional(),
    threadId: idString.optional(),
    taskId: idString.optional(),
    teamId: idString.optional(),
    teammateId: idString.optional(),
    actorId: idString.optional(),
    payload: z.record(z.unknown()).default({}),
    at: isoTimestamp,
  })
  .strict();

export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;

/**
 * SSE message frame used by `GET /api/threads/:id/events` (and the
 * per-team / per-task variants). Mirrors the durable envelope but adds an
 * SSE-stream-local cursor field for resume.
 */
export const sseFrameSchema = z
  .object({
    cursor: z.string(),
    event: eventEnvelopeSchema,
  })
  .strict();
export type SseFrame = z.infer<typeof sseFrameSchema>;
