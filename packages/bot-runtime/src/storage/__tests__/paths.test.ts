import { describe, expect, it } from "vitest";
import { createPaths } from "../paths.js";

describe("paths", () => {
  const paths = createPaths("/data");

  it("instanceRoot", () => {
    expect(paths.instanceRoot("rt-1")).toBe("/data/instances/rt-1");
  });

  it("lock", () => {
    expect(paths.lock("rt-1")).toBe("/data/instances/rt-1/.lock");
  });

  it("runtimeInfo", () => {
    expect(paths.runtimeInfo("rt-1")).toBe("/data/instances/rt-1/.runtime-info.json");
  });

  it("threadDir", () => {
    expect(paths.threadDir("rt-1", "th-1")).toBe(
      "/data/instances/rt-1/state/threads/th-1"
    );
  });

  it("taskDir", () => {
    expect(paths.taskDir("rt-1", "th-1", "tk-1")).toBe(
      "/data/instances/rt-1/state/threads/th-1/tasks/tk-1"
    );
  });

  it("taskEvents (jsonl)", () => {
    expect(paths.taskEvents("rt-1", "th-1", "tk-1")).toBe(
      "/data/instances/rt-1/state/threads/th-1/tasks/tk-1/events.jsonl"
    );
  });

  it("planRevision", () => {
    expect(paths.planRevision("rt-1", "th-1", "tk-1", "rv-1")).toBe(
      "/data/instances/rt-1/state/threads/th-1/tasks/tk-1/plan-revisions/rv-1.json"
    );
  });

  it("outputs and archive", () => {
    expect(paths.outputs("rt-1", "th-1", "tk-1")).toBe(
      "/data/instances/rt-1/state/threads/th-1/tasks/tk-1/user-data/outputs"
    );
    expect(paths.outputsArchive("rt-1", "th-1", "tk-1", "rv-1")).toBe(
      "/data/instances/rt-1/state/threads/th-1/tasks/tk-1/user-data/outputs/_archive/rv-1"
    );
  });

  it("jobs", () => {
    expect(paths.jobsDir("rt-1", "pending")).toBe(
      "/data/instances/rt-1/state/jobs/pending"
    );
    expect(paths.jobFile("rt-1", "locked", "job-1")).toBe(
      "/data/instances/rt-1/state/jobs/locked/job-1.json"
    );
  });

  it("channels and bindings", () => {
    expect(paths.channelConfig("rt-1", "feishu")).toBe(
      "/data/instances/rt-1/state/channels/feishu.json"
    );
    expect(paths.binding("rt-1", "th-1", "feishu", "bd-1")).toBe(
      "/data/instances/rt-1/state/bindings/th-1/feishu/bd-1/active.json"
    );
    expect(paths.chatClaim("rt-1", "feishu", "oc_xxx")).toBe(
      "/data/instances/rt-1/state/chat-claims/feishu/oc_xxx"
    );
  });

  it("criticalNodePolicy", () => {
    expect(paths.criticalNodePolicy("rt-1", "p-1")).toBe(
      "/data/instances/rt-1/state/critical-node-policies/p-1.json"
    );
  });
});
