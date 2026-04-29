import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPaths } from "../../storage/paths.js";
import { isDuplicateInboundEvent, recordInboundEvent } from "../inbound-dedupe.js";

describe("inbound dedupe", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "ded-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  it("first call records event, second is detected as duplicate", async () => {
    const paths = createPaths(dataRoot);
    expect(await isDuplicateInboundEvent(paths, "rt-1", "feishu", "evt-1")).toBe(false);
    await recordInboundEvent(paths, "rt-1", "feishu", "evt-1", { foo: 1 });
    expect(await isDuplicateInboundEvent(paths, "rt-1", "feishu", "evt-1")).toBe(true);
  });
});
