import { z } from "zod";
import { UserIdSchema } from "./user.js";

export const NodeMatcherSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("tool"),
    toolName: z.string(),
    argMatch: z.record(z.unknown()).optional(),
  }),
  z.object({
    kind: z.literal("external_io"),
    direction: z.literal("outbound"),
    provider: z.string().optional(),
  }),
  z.object({
    kind: z.literal("filesystem"),
    op: z.enum(["delete", "overwrite"]),
    minCount: z.number().int().positive().optional(),
  }),
  z.object({
    kind: z.literal("budget_overflow"),
    dim: z.enum(["time", "tokens", "subagents", "cost"]),
  }),
  z.object({
    kind: z.literal("out_of_scope"),
    planRevisionId: z.string(),
  }),
]);
export type NodeMatcher = z.infer<typeof NodeMatcherSchema>;

export const CriticalNodePolicySchema = z.object({
  id: z.string(),
  scope: z.enum(["global", "user", "thread", "skill"]),
  matcher: NodeMatcherSchema,
  action: z.enum(["require_approval", "block", "log_only"]),
  ownerUserId: UserIdSchema,
  enabled: z.boolean(),
  createdAt: z.string().datetime({ offset: true }),
});
export type CriticalNodePolicy = z.infer<typeof CriticalNodePolicySchema>;
