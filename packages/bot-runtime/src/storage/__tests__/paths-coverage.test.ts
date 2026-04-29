import { describe, expect, it } from "vitest";
import type { Provider } from "../../schema/channel.js";
import { type Paths, createPaths } from "../paths.js";

const RT = "rt_test";
const TH = "th_thread";
const TK = "tk_task";
const PR: Provider = "feishu";
const RV = "rev_a";
const UID = "user_123";
const JID = "job_456";
const BID = "binding_789";
const EID = "event_abc";
const ECID = "external_chat_xyz";
const PID = "policy_def";

const ARGS: Array<[keyof Paths, unknown[]]> = [
  ["dataRoot", []],
  ["instanceRoot", [RT]],
  ["lock", [RT]],
  ["runtimeInfo", [RT]],
  ["state", [RT]],
  ["user", [RT, UID]],
  ["threadsRoot", [RT]],
  ["threadDir", [RT, TH]],
  ["threadJson", [RT, TH]],
  ["transcript", [RT, TH]],
  ["guardDecisions", [RT, TH]],
  ["threadContextDir", [RT, TH]],
  ["threadDrafts", [RT, TH]],
  ["taskDir", [RT, TH, TK]],
  ["taskJson", [RT, TH, TK]],
  ["taskPlan", [RT, TH, TK]],
  ["planRevision", [RT, TH, TK, RV]],
  ["taskEvents", [RT, TH, TK]],
  ["taskControl", [RT, TH, TK]],
  ["taskContext", [RT, TH, TK]],
  ["workspace", [RT, TH, TK]],
  ["uploads", [RT, TH, TK]],
  ["outputs", [RT, TH, TK]],
  ["outputsArchive", [RT, TH, TK, RV]],
  ["jobsDir", [RT, "pending"]],
  ["jobFile", [RT, "pending", JID]],
  ["channelConfig", [RT, PR]],
  ["binding", [RT, TH, PR, BID]],
  ["chatClaim", [RT, PR, ECID]],
  ["webhookEvent", [RT, PR, EID]],
  ["criticalNodePolicy", [RT, PID]],
];

describe("paths.ts coverage", () => {
  it.each(ARGS)(
    "%s returns non-empty path containing runtimeId without traversal",
    (method, args) => {
      const p = createPaths("/tmp/data");
      const val = (p as Record<string, unknown>)[method];
      // dataRoot is a string property, not a method
      if (method === "dataRoot") {
        expect(typeof val).toBe("string");
        const str = val as string;
        expect(str.length).toBeGreaterThan(0);
        expect(str).not.toContain("..");
      } else {
        expect(typeof val).toBe("function");
        const fn = val as (...a: unknown[]) => string;
        const result = fn(...args);
        expect(typeof result).toBe("string");
        expect(result.length).toBeGreaterThan(0);
        expect(result).toContain(RT);
        expect(result).not.toContain("..");
      }
    },
  );
});
