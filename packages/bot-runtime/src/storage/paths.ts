import path from "node:path";

export type JobStatus = "pending" | "locked" | "done" | "failed" | "dedupe";

export type Paths = {
  dataRoot: string;
  instanceRoot(runtimeId: string): string;
  lock(runtimeId: string): string;
  runtimeInfo(runtimeId: string): string;
  state(runtimeId: string): string;
  user(runtimeId: string, userId: string): string;
  threadsRoot(runtimeId: string): string;
  threadDir(runtimeId: string, threadId: string): string;
  threadJson(runtimeId: string, threadId: string): string;
  transcript(runtimeId: string, threadId: string): string;
  guardDecisions(runtimeId: string, threadId: string): string;
  threadContextDir(runtimeId: string, threadId: string): string;
  threadDrafts(runtimeId: string, threadId: string): string;
  taskDir(runtimeId: string, threadId: string, taskId: string): string;
  taskJson(runtimeId: string, threadId: string, taskId: string): string;
  taskPlan(runtimeId: string, threadId: string, taskId: string): string;
  planRevision(runtimeId: string, threadId: string, taskId: string, revisionId: string): string;
  taskEvents(runtimeId: string, threadId: string, taskId: string): string;
  taskControl(runtimeId: string, threadId: string, taskId: string): string;
  taskContext(runtimeId: string, threadId: string, taskId: string): string;
  workspace(runtimeId: string, threadId: string, taskId: string): string;
  uploads(runtimeId: string, threadId: string, taskId: string): string;
  outputs(runtimeId: string, threadId: string, taskId: string): string;
  outputsArchive(runtimeId: string, threadId: string, taskId: string, revisionId: string): string;
  jobsDir(runtimeId: string, status: JobStatus): string;
  jobFile(runtimeId: string, status: JobStatus, jobId: string): string;
  channelConfig(runtimeId: string, channelType: string): string;
  binding(runtimeId: string, threadId: string, channelType: string, bindingId: string): string;
  chatClaim(runtimeId: string, channelType: string, externalChatId: string): string;
  webhookEvent(runtimeId: string, channelType: string, eventId: string): string;
  criticalNodePolicy(runtimeId: string, policyId: string): string;
};

export function createPaths(dataRoot: string): Paths {
  const join = path.posix.join;
  const instance = (rt: string) => join(dataRoot, "instances", rt);
  const state = (rt: string) => join(instance(rt), "state");
  const thread = (rt: string, th: string) => join(state(rt), "threads", th);
  const task = (rt: string, th: string, tk: string) => join(thread(rt, th), "tasks", tk);
  const userData = (rt: string, th: string, tk: string) => join(task(rt, th, tk), "user-data");

  return {
    dataRoot,
    instanceRoot: instance,
    lock: (rt) => join(instance(rt), ".lock"),
    runtimeInfo: (rt) => join(instance(rt), ".runtime-info.json"),
    state,
    user: (rt, u) => join(state(rt), "users", `${u}.json`),
    threadsRoot: (rt) => join(state(rt), "threads"),
    threadDir: thread,
    threadJson: (rt, th) => join(thread(rt, th), "thread.json"),
    transcript: (rt, th) => join(thread(rt, th), "transcript.jsonl"),
    guardDecisions: (rt, th) => join(thread(rt, th), "guard-decisions.jsonl"),
    threadContextDir: (rt, th) => join(thread(rt, th), "context"),
    threadDrafts: (rt, th) => join(thread(rt, th), "drafts"),
    taskDir: task,
    taskJson: (rt, th, tk) => join(task(rt, th, tk), "task.json"),
    taskPlan: (rt, th, tk) => join(task(rt, th, tk), "plan.json"),
    planRevision: (rt, th, tk, rv) => join(task(rt, th, tk), "plan-revisions", `${rv}.json`),
    taskEvents: (rt, th, tk) => join(task(rt, th, tk), "events.jsonl"),
    taskControl: (rt, th, tk) => join(task(rt, th, tk), "control.json"),
    taskContext: (rt, th, tk) => join(task(rt, th, tk), "context"),
    workspace: (rt, th, tk) => join(userData(rt, th, tk), "workspace"),
    uploads: (rt, th, tk) => join(userData(rt, th, tk), "uploads"),
    outputs: (rt, th, tk) => join(userData(rt, th, tk), "outputs"),
    outputsArchive: (rt, th, tk, rv) => join(userData(rt, th, tk), "outputs", "_archive", rv),
    jobsDir: (rt, status) => join(state(rt), "jobs", status),
    jobFile: (rt, status, jid) => join(state(rt), "jobs", status, `${jid}.json`),
    channelConfig: (rt, ct) => join(state(rt), "channels", `${ct}.json`),
    binding: (rt, th, ct, bid) => join(state(rt), "bindings", th, ct, bid, "active.json"),
    chatClaim: (rt, ct, ec) => join(state(rt), "chat-claims", ct, ec),
    webhookEvent: (rt, ct, eid) => join(state(rt), "webhooks", ct, `${eid}.json`),
    criticalNodePolicy: (rt, pid) => join(state(rt), "critical-node-policies", `${pid}.json`),
  };
}
