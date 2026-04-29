import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPaths } from "../../storage/paths.js";
import { createGuardDecisionRepo } from "../guard-decision-repo.js";
import { createTranscriptRepo } from "../transcript-repo.js";

describe("TranscriptRepo + GuardDecisionRepo", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "trg-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  const th = "th_aaaaaaaa-bbbb-7ccc-ddde-eeeeeeeeeeee";

  it("appends sanitized transcript entries", async () => {
    const t = createTranscriptRepo(createPaths(dataRoot), "rt-1");
    await t.append(th, {
      kind: "user_message",
      messageId: "msg-1",
      text: "Bearer abcDEFghiJKLmnOPqrSTUVwxYZ12 plz help",
      at: "2026-04-28T00:00:00Z",
    });
    const all = await t.read(th);
    expect(all[0]).toMatchObject({ kind: "user_message" });
    expect((all[0] as { text: string }).text).toContain("<redacted:secret>");
  });

  it("appends GuardDecisions and reads back via repo", async () => {
    const g = createGuardDecisionRepo(createPaths(dataRoot), "rt-1");
    await g.append({
      id: "guard_018f5d20-0000-7000-8000-000000000001",
      messageId: "msg-1",
      threadId: th,
      source: "lark_group",
      intent: "irrelevant",
      shortCircuited: true,
      ruleHits: ["bound_group_no_mention"],
      confidence: 0,
      requiresUserConfirmation: false,
      reason: "noisy",
      createdAt: "2026-04-28T00:00:00Z",
    });
    const decisions = await g.read(th);
    expect(decisions).toHaveLength(1);
    expect(decisions[0]?.shortCircuited).toBe(true);
  });
});
