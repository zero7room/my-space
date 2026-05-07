/**
 * Path layout for `data/instances/<runtimeId>/...`.
 *
 * All consumers should construct paths via these helpers — never join strings
 * by hand. `safeRelativePath` validates that user-supplied path fragments
 * never escape the runtime root via `..`.
 */
import path from 'node:path';

import { PathOutsideRootError } from './errors.js';

export interface InstancePathsOptions {
  /** Filesystem root that contains `data/instances/`. Usually the cwd. */
  workspaceRoot: string;
  /** `<runtimeId>` matched by `RUNTIME_ID_REGEX`. */
  runtimeId: string;
}

export class InstancePaths {
  readonly workspaceRoot: string;
  readonly runtimeId: string;

  constructor(opts: InstancePathsOptions) {
    this.workspaceRoot = path.resolve(opts.workspaceRoot);
    this.runtimeId = opts.runtimeId;
  }

  // ---- top-level ----
  get instanceRoot(): string {
    return path.join(this.workspaceRoot, 'data', 'instances', this.runtimeId);
  }
  get lockFile(): string {
    return path.join(this.instanceRoot, '.lock');
  }
  get runtimeInfoFile(): string {
    return path.join(this.instanceRoot, '.runtime-info.json');
  }
  get stateRoot(): string {
    return path.join(this.instanceRoot, 'state');
  }
  get workspace(): string {
    return path.join(this.instanceRoot, 'workspace');
  }
  get skillsPublicRoot(): string {
    return path.join(this.instanceRoot, 'skills', 'public');
  }
  get skillsCustomRoot(): string {
    return path.join(this.instanceRoot, 'skills', 'custom');
  }

  // ---- state subdirs ----
  get usersRoot(): string {
    return path.join(this.stateRoot, 'users');
  }
  userFile(userId: string): string {
    return path.join(this.usersRoot, `${userId}.json`);
  }

  get threadsRoot(): string {
    return path.join(this.stateRoot, 'threads');
  }
  threadRoot(threadId: string): string {
    return path.join(this.threadsRoot, threadId);
  }
  threadFile(threadId: string): string {
    return path.join(this.threadRoot(threadId), 'thread.json');
  }
  threadTranscript(threadId: string): string {
    return path.join(this.threadRoot(threadId), 'transcript.jsonl');
  }
  threadGuardLog(threadId: string): string {
    return path.join(this.threadRoot(threadId), 'guard-decisions.jsonl');
  }
  threadContextDir(threadId: string): string {
    return path.join(this.threadRoot(threadId), 'context');
  }
  threadDraftsDir(threadId: string): string {
    return path.join(this.threadRoot(threadId), 'drafts');
  }
  threadDraftTask(threadId: string): string {
    return path.join(this.threadDraftsDir(threadId), 'task-draft.json');
  }
  threadDraftPlan(threadId: string): string {
    return path.join(this.threadDraftsDir(threadId), 'plan-draft.json');
  }
  threadTaskListFile(threadId: string): string {
    return path.join(this.threadRoot(threadId), 'task-list.json');
  }

  threadTasksRoot(threadId: string): string {
    return path.join(this.threadRoot(threadId), 'tasks');
  }
  taskRoot(threadId: string, taskId: string): string {
    return path.join(this.threadTasksRoot(threadId), taskId);
  }
  taskFile(threadId: string, taskId: string): string {
    return path.join(this.taskRoot(threadId, taskId), 'task.json');
  }
  taskPlanFile(threadId: string, taskId: string): string {
    return path.join(this.taskRoot(threadId, taskId), 'plan.json');
  }
  taskPlanRevisionsRoot(threadId: string, taskId: string): string {
    return path.join(this.taskRoot(threadId, taskId), 'plan-revisions');
  }
  taskPlanRevisionFile(
    threadId: string,
    taskId: string,
    revisionId: string,
  ): string {
    return path.join(
      this.taskPlanRevisionsRoot(threadId, taskId),
      `${revisionId}.json`,
    );
  }
  taskEventsLog(threadId: string, taskId: string): string {
    return path.join(this.taskRoot(threadId, taskId), 'events.jsonl');
  }
  taskControlFile(threadId: string, taskId: string): string {
    return path.join(this.taskRoot(threadId, taskId), 'control.json');
  }
  taskLogsDir(threadId: string, taskId: string): string {
    return path.join(this.taskRoot(threadId, taskId), 'logs');
  }
  taskContextDir(threadId: string, taskId: string): string {
    return path.join(this.taskRoot(threadId, taskId), 'context');
  }
  taskUserDataDir(threadId: string, taskId: string): string {
    return path.join(this.taskRoot(threadId, taskId), 'user-data');
  }
  taskWorkspace(threadId: string, taskId: string): string {
    return path.join(this.taskUserDataDir(threadId, taskId), 'workspace');
  }
  taskUploads(threadId: string, taskId: string): string {
    return path.join(this.taskUserDataDir(threadId, taskId), 'uploads');
  }
  taskOutputs(threadId: string, taskId: string): string {
    return path.join(this.taskUserDataDir(threadId, taskId), 'outputs');
  }
  taskOutputArchiveDir(
    threadId: string,
    taskId: string,
    revisionId: string,
  ): string {
    return path.join(this.taskOutputs(threadId, taskId), '_archive', revisionId);
  }
  taskArtifactsRoot(threadId: string, taskId: string): string {
    return path.join(this.taskRoot(threadId, taskId), 'artifacts');
  }
  taskArtifactFile(
    threadId: string,
    taskId: string,
    artifactId: string,
  ): string {
    return path.join(this.taskArtifactsRoot(threadId, taskId), `${artifactId}.json`);
  }
  taskChangeRecordsRoot(threadId: string, taskId: string): string {
    return path.join(this.taskRoot(threadId, taskId), 'change-records');
  }
  taskChangeRecordFile(
    threadId: string,
    taskId: string,
    changeRecordId: string,
  ): string {
    return path.join(
      this.taskChangeRecordsRoot(threadId, taskId),
      `${changeRecordId}.json`,
    );
  }

  // ---- teams ----
  taskTeamsRoot(threadId: string, taskId: string): string {
    return path.join(this.taskRoot(threadId, taskId), 'teams');
  }
  teamRoot(threadId: string, taskId: string, teamId: string): string {
    return path.join(this.taskTeamsRoot(threadId, taskId), teamId);
  }
  teamFile(threadId: string, taskId: string, teamId: string): string {
    return path.join(this.teamRoot(threadId, taskId, teamId), 'team.json');
  }
  teamControlFile(threadId: string, taskId: string, teamId: string): string {
    return path.join(this.teamRoot(threadId, taskId, teamId), 'control.json');
  }
  teamMessageSeqFile(
    threadId: string,
    taskId: string,
    teamId: string,
  ): string {
    return path.join(this.teamRoot(threadId, taskId, teamId), '_message-seq');
  }
  teamEventsLog(threadId: string, taskId: string, teamId: string): string {
    return path.join(
      this.teamRoot(threadId, taskId, teamId),
      'team-events.jsonl',
    );
  }
  teamMessagesLog(threadId: string, taskId: string, teamId: string): string {
    return path.join(this.teamRoot(threadId, taskId, teamId), 'messages.jsonl');
  }
  teamWorkItemRoot(
    threadId: string,
    taskId: string,
    teamId: string,
    bucket:
      | 'available'
      | 'claimed'
      | 'completed'
      | 'failed'
      | 'cancelled',
  ): string {
    return path.join(
      this.teamRoot(threadId, taskId, teamId),
      'work-items',
      bucket,
    );
  }
  teamWorkItemFile(
    threadId: string,
    taskId: string,
    teamId: string,
    bucket:
      | 'available'
      | 'claimed'
      | 'completed'
      | 'failed'
      | 'cancelled',
    workItemId: string,
  ): string {
    return path.join(
      this.teamWorkItemRoot(threadId, taskId, teamId, bucket),
      `${workItemId}.json`,
    );
  }
  teammatesRoot(threadId: string, taskId: string, teamId: string): string {
    return path.join(this.teamRoot(threadId, taskId, teamId), 'teammates');
  }
  teammateRoot(
    threadId: string,
    taskId: string,
    teamId: string,
    teammateId: string,
  ): string {
    return path.join(this.teammatesRoot(threadId, taskId, teamId), teammateId);
  }
  teammateFile(
    threadId: string,
    taskId: string,
    teamId: string,
    teammateId: string,
  ): string {
    return path.join(
      this.teammateRoot(threadId, taskId, teamId, teammateId),
      'teammate.json',
    );
  }
  teammateEventsLog(
    threadId: string,
    taskId: string,
    teamId: string,
    teammateId: string,
  ): string {
    return path.join(
      this.teammateRoot(threadId, taskId, teamId, teammateId),
      'events.jsonl',
    );
  }
  teammateControlFile(
    threadId: string,
    taskId: string,
    teamId: string,
    teammateId: string,
  ): string {
    return path.join(
      this.teammateRoot(threadId, taskId, teamId, teammateId),
      'control.json',
    );
  }

  // ---- channels / bindings / claims ----
  bindingsRoot(threadId: string): string {
    return path.join(this.stateRoot, 'bindings', threadId);
  }
  bindingDir(threadId: string, channelType: string, bindingId: string): string {
    return path.join(this.bindingsRoot(threadId), channelType, bindingId);
  }
  bindingActiveFile(
    threadId: string,
    channelType: string,
    bindingId: string,
  ): string {
    return path.join(this.bindingDir(threadId, channelType, bindingId), 'active.json');
  }
  bindingHistoryRoot(
    threadId: string,
    channelType: string,
    bindingId: string,
  ): string {
    return path.join(this.bindingDir(threadId, channelType, bindingId), 'history');
  }
  chatClaimFile(channelType: string, externalChatId: string): string {
    return path.join(
      this.stateRoot,
      'chat-claims',
      channelType,
      externalChatId,
    );
  }
  channelConfigFile(channelType: string): string {
    return path.join(this.stateRoot, 'channels', `${channelType}.json`);
  }
  channelMessagesIdxRoot(channelType: string): string {
    return path.join(this.stateRoot, 'channel-messages', channelType, '_idx');
  }
  webhookEventFile(channelType: string, eventId: string): string {
    return path.join(this.stateRoot, 'webhooks', channelType, `${eventId}.json`);
  }

  // ---- policies / jobs / index / diagnostics / transactions / locks ----
  policyFile(policyId: string): string {
    return path.join(this.stateRoot, 'critical-node-policies', `${policyId}.json`);
  }
  transactionFile(txId: string): string {
    return path.join(this.stateRoot, '_transactions', `${txId}.json`);
  }
  retrySchedulerLockFile(): string {
    return path.join(this.stateRoot, '_locks', 'retry-scheduler.lock');
  }
  jobFile(
    bucket: 'pending' | 'locked' | 'done' | 'failed',
    jobId: string,
  ): string {
    return path.join(this.stateRoot, 'jobs', bucket, `${jobId}.json`);
  }
  jobDedupeFile(dedupeKey: string): string {
    return path.join(this.stateRoot, 'jobs', 'dedupe', dedupeKey);
  }
  indexRoot(): string {
    return path.join(this.stateRoot, '_index');
  }
  diagnosticsRoot(): string {
    return path.join(this.stateRoot, '_diagnostics');
  }
  diagnosticFile(name: string): string {
    return path.join(this.diagnosticsRoot(), name);
  }
  transactionsRoot(): string {
    return path.join(this.stateRoot, '_transactions');
  }
  jobsBucketRoot(bucket: 'pending' | 'locked' | 'done' | 'failed' | 'dedupe'): string {
    return path.join(this.stateRoot, 'jobs', bucket);
  }
}

/**
 * Reject `..` traversal. Caller-supplied path fragments must not escape `root`.
 * Returns the resolved absolute path.
 */
export function safeRelativePath(root: string, candidate: string): string {
  const resolved = path.resolve(root, candidate);
  const rel = path.relative(root, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new PathOutsideRootError(
      `path "${candidate}" escapes root "${root}"`,
    );
  }
  return resolved;
}
