import { appendJsonl, readJsonl } from "../storage/jsonl.js";
import type { Paths } from "../storage/paths.js";
import {
  type GuardDecision,
  GuardDecisionSchema,
} from "../schema/guard-decision.js";
import { sanitize } from "../storage/sanitize.js";

export type GuardDecisionRepo = {
  append(decision: GuardDecision): Promise<void>;
  read(threadId: string): Promise<GuardDecision[]>;
};

export function createGuardDecisionRepo(
  paths: Paths,
  runtimeId: string,
): GuardDecisionRepo {
  return {
    async append(decision) {
      const validated = GuardDecisionSchema.parse(decision);
      await appendJsonl(
        paths.guardDecisions(runtimeId, decision.threadId),
        sanitize(validated),
      );
    },
    async read(threadId) {
      const raw = await readJsonl<unknown>(
        paths.guardDecisions(runtimeId, threadId),
      );
      return raw.map((r) => GuardDecisionSchema.parse(r));
    },
  };
}
