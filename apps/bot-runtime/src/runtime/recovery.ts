/**
 * Startup recovery scan. Composes:
 *
 *   1. Acquire instance lock (caller wires; we just verify).
 *   2. Clean `.tmp.*` orphans across known dirs.
 *   3. Replay / rollback `_transactions/` records.
 *   4. Migrate v1 tasks to v2 with default TaskRetryState.
 *   5. Reconcile each thread's task-list.json against tasks/ subdirs.
 *   6. Emit `task_list_repair` / `task_schema_migrated` /
 *      `transaction_pending_dropped` events on a runtime-level diagnostics log.
 *   7. Requeue locked outbound jobs back to pending.
 *   8. Recover stale running tasks: any task with status `running` is
 *      transitioned to `blocked` with reason `non_idempotent_tool_in_flight`
 *      so an operator can decide before automatic retry.
 *   9. Recover retry scheduler lock (rename stale).
 *   10. Recover team status — `forming` teams without teammates collapse to
 *       `cancelled`; `finishing` teams check that a summary exists, otherwise
 *       drop to `failed`.
 *
 * The scan is intentionally conservative: ambiguous states fail to a manual
 * decision rather than silently retry.
 */
import {
  type EventEnvelope,
  type Task,
  type Team,
  applyTaskTransition,
  newEventId,
} from '@ai-workflow/contracts';
import {
  InstancePaths,
  Transactions,
  appendJsonl,
  cleanupTmpOrphans,
  ensureDir,
  listSubdirsSorted,
  readJson,
  sha256File,
} from '@ai-workflow/fs-store';
import path from 'node:path';

import { migrateTaskToV2 } from './migrations/task-retry-state.js';
import {
  TaskRepository,
  TaskListRepository,
  ThreadRepository,
  ChannelJobRepository,
  TeamRepository,
  type Clock,
} from './repositories/index.js';
import { systemClock } from './repositories/types.js';

export interface RecoveryReport {
  startedAt: string;
  completedAt: string;
  tmpOrphansRemoved: number;
  txReplayed: string[];
  txRolledBack: string[];
  tasksMigrated: number;
  taskListsRepaired: number;
  staleRunningTasksBlocked: number;
  jobsRequeued: number;
  teamsFailed: number;
  teamsCancelled: number;
  teamsReclaimed: number;
  artifactWarnings: number;
  events: EventEnvelope[];
}

export interface RecoveryDeps {
  paths: InstancePaths;
  clock?: Clock;
}

export class RecoveryScanner {
  private readonly paths: InstancePaths;
  private readonly clock: Clock;
  private readonly tx: Transactions;
  private readonly threadRepo: ThreadRepository;
  private readonly taskRepo: TaskRepository;
  private readonly taskListRepo: TaskListRepository;
  private readonly jobRepo: ChannelJobRepository;
  private readonly teamRepo: TeamRepository;

  constructor(deps: RecoveryDeps) {
    this.paths = deps.paths;
    this.clock = deps.clock ?? systemClock;
    this.tx = new Transactions({
      transactionsRoot: this.paths.transactionsRoot(),
    });
    this.threadRepo = new ThreadRepository(this.paths);
    this.taskRepo = new TaskRepository(this.paths);
    this.taskListRepo = new TaskListRepository(this.paths);
    this.jobRepo = new ChannelJobRepository(this.paths);
    this.teamRepo = new TeamRepository(this.paths);
  }

  async run(): Promise<RecoveryReport> {
    const startedAt = this.clock.iso();
    const events: EventEnvelope[] = [];
    const append = (env: Omit<EventEnvelope, 'id' | 'seq'>): EventEnvelope => {
      const built: EventEnvelope = {
        id: newEventId(),
        seq: events.length,
        kind: env.kind,
        txId: env.txId,
        threadId: env.threadId,
        taskId: env.taskId,
        teamId: env.teamId,
        teammateId: env.teammateId,
        actorId: env.actorId,
        payload: env.payload ?? {},
        at: env.at,
      };
      events.push(built);
      return built;
    };

    append({
      kind: 'runtime_recovery_scan_started',
      payload: { instanceRoot: this.paths.instanceRoot },
      at: startedAt,
    });

    // 2. clean tmp orphans across known dirs
    let tmpOrphansRemoved = 0;
    const knownDirs = [
      this.paths.stateRoot,
      this.paths.threadsRoot,
      this.paths.transactionsRoot(),
    ];
    for (const d of knownDirs) {
      tmpOrphansRemoved += await cleanupTmpOrphans(d);
    }

    // 3. transactions
    const txOut = await this.tx.recover();
    for (const id of txOut.rolledback) {
      append({
        kind: 'transaction_pending_dropped',
        payload: { txId: id },
        at: this.clock.iso(),
      });
    }

    // 4. migrate v1 tasks → v2
    let tasksMigrated = 0;
    let staleRunningTasksBlocked = 0;
    let taskListsRepaired = 0;

    const threadIds = await listSubdirsSorted(this.paths.threadsRoot);
    for (const threadId of threadIds) {
      const tasks: Task[] = [];
      const tasksRoot = this.paths.threadTasksRoot(threadId);
      const taskIds = await listSubdirsSorted(tasksRoot);
      for (const taskId of taskIds) {
        const t = await this.taskRepo.get(threadId, taskId);
        if (!t) continue;
        const result = migrateTaskToV2(t);
        let task = t;
        if (result.migrated) {
          try {
            await this.taskRepo.update(result.task);
            task = result.task;
            tasksMigrated++;
            append({
              kind: 'task_schema_migrated',
              taskId: t.id,
              threadId: t.threadId,
              payload: {
                taskId: t.id,
                fromVersion: result.fromVersion,
                toVersion: result.toVersion,
                migratedFields: result.migratedFields,
              },
              at: this.clock.iso(),
            });
          } catch (err) {
            // Persist a sidecar marker so an operator can investigate. The
            // original task.json is left untouched and no migration event is
            // emitted (acceptance 35).
            try {
              const fsm = await import('node:fs/promises');
              const marker = path.join(
                this.paths.taskRoot(threadId, t.id),
                'migration-pending.json',
              );
              await fsm.mkdir(path.dirname(marker), { recursive: true });
              await fsm.writeFile(
                marker,
                JSON.stringify(
                  {
                    taskId: t.id,
                    fromVersion: result.fromVersion,
                    toVersion: result.toVersion,
                    attemptedAt: this.clock.iso(),
                    error: err instanceof Error ? err.message : String(err),
                  },
                  null,
                  2,
                ),
              );
            } catch {
              /* best-effort marker */
            }
            // task remains the original v1 record
          }
        } else {
          task = result.task;
        }
        // 8. recover stale running tasks
        if (task.status === 'running') {
          try {
            task = applyTaskTransition(task, 'blocked', {
              blockedReason: 'non_idempotent_tool_in_flight',
              now: this.clock.iso(),
            });
            await this.taskRepo.update(task);
            staleRunningTasksBlocked++;
            append({
              kind: 'task_blocked',
              taskId: task.id,
              threadId: task.threadId,
              payload: {
                reason: 'recovery_stale_running',
                blockedReason: 'non_idempotent_tool_in_flight',
                suggestedActions: ['retry', 'skip', 'cancel'],
              },
              at: this.clock.iso(),
            });
          } catch {
            // ignore — schema would reject; conservative path
          }
        }
        tasks.push(task);
      }

      // 5. reconcile TaskList
      const expected = tasks
        .filter((t) => t.confirmedByUserId !== undefined)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((t) => t.id);
      const persisted = await this.taskListRepo.load(threadId);
      const persistedIds = persisted?.orderedTaskIds ?? [];
      const drifted =
        persistedIds.length !== expected.length ||
        persistedIds.some((id, i) => id !== expected[i]);
      if (drifted) {
        const next =
          persisted ??
          {
            id: `tl_${'0'.repeat(21)}`,
            threadId,
            orderedTaskIds: expected,
            createdAt: this.clock.iso(),
            updatedAt: this.clock.iso(),
          };
        await this.taskListRepo.save({
          ...next,
          orderedTaskIds: expected,
          updatedAt: this.clock.iso(),
        });
        taskListsRepaired++;
        append({
          kind: 'task_list_repair',
          threadId,
          payload: {
            beforeCount: persistedIds.length,
            afterCount: expected.length,
          },
          at: this.clock.iso(),
        });
      }
    }

    // 7. requeue locked jobs
    const lockedJobs = await this.jobRepo.list('locked');
    for (const j of lockedJobs) {
      await this.jobRepo.move(j, 'locked', 'pending');
    }
    const jobsRequeued = lockedJobs.length;

    // 10. recover team status
    let teamsFailed = 0;
    let teamsCancelled = 0;
    let teamsReclaimed = 0;
    let artifactWarnings = 0;
    for (const threadId of threadIds) {
      const tasksRoot = this.paths.threadTasksRoot(threadId);
      const taskIds = await listSubdirsSorted(tasksRoot);
      for (const taskId of taskIds) {
        // 6. artifact consistency — compare recorded sha256 vs disk sha256
        const arts = await this.taskRepo.listForThread
          ? await (async () => {
              const artifactsDir = this.paths.taskArtifactsRoot(threadId, taskId);
              const files = await import('@ai-workflow/fs-store').then((m) =>
                m.listJsonFilesSorted(artifactsDir),
              );
              const out: Array<{ id: string; relativePath: string; sha256: string }> = [];
              for (const f of files) {
                const rec = await readJson<{ id: string; relativePath: string; sha256: string }>(f);
                if (rec) out.push(rec);
              }
              return out;
            })()
          : [];
        for (const a of arts) {
          const workspace = this.paths.taskWorkspace(threadId, taskId);
          const outputs = this.paths.taskOutputs(threadId, taskId);
          const candidate = a.relativePath.startsWith('outputs/')
            ? path.join(outputs, a.relativePath.slice('outputs/'.length))
            : path.join(workspace, a.relativePath);
          try {
            const actual = await sha256File(candidate);
            if (actual !== a.sha256) {
              artifactWarnings++;
              append({
                kind: 'artifact_consistency_warning',
                threadId,
                taskId,
                payload: {
                  warning: 'sha256_mismatch',
                  artifactId: a.id,
                  recordedSha256: a.sha256,
                  actualSha256: actual,
                },
                at: this.clock.iso(),
              });
            }
          } catch (err) {
            if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
              artifactWarnings++;
              append({
                kind: 'artifact_consistency_warning',
                threadId,
                taskId,
                payload: { warning: 'missing', artifactId: a.id },
                at: this.clock.iso(),
              });
            }
          }
        }

        const teams = await this.teamRepo.listTeamsForTask(threadId, taskId);
        for (const team of teams) {
          const updated = await recoverTeam(team, this.teamRepo, threadId, taskId, this.paths);
          if (updated.status === 'failed') {
            teamsFailed++;
            append({
              kind: 'team_failed',
              threadId,
              taskId,
              teamId: team.id,
              payload: { reason: 'recovery' },
              at: this.clock.iso(),
            });
          } else if (updated.status === 'cancelled') {
            teamsCancelled++;
            append({
              kind: 'team_cancelled',
              threadId,
              taskId,
              teamId: team.id,
              payload: { reason: 'recovery_no_teammates' },
              at: this.clock.iso(),
            });
          } else if (team.status === 'active' || team.status === 'finishing') {
            // For active / finishing, reclaim orphaned work-items that have
            // an expired claim lease by renaming back to available/.
            teamsReclaimed += await reclaimExpiredWorkItems(
              this.paths,
              threadId,
              taskId,
              team.id,
              this.clock,
            );
          }
        }
      }
    }

    // 9. recover retry-scheduler lock — read existing if expired, rename to stale
    const retryLockPath = this.paths.retrySchedulerLockFile();
    const lockJson = await readJson<{ leaseExpireAt?: string; fencingToken?: number }>(
      retryLockPath,
    );
    if (lockJson && lockJson.leaseExpireAt) {
      const exp = Date.parse(lockJson.leaseExpireAt);
      if (Number.isFinite(exp) && exp < Date.now()) {
        const stale = `${retryLockPath}.stale.${lockJson.fencingToken ?? 'x'}`;
        try {
          const fs = await import('node:fs/promises');
          await fs.rename(retryLockPath, stale);
        } catch {
          /* idempotent */
        }
      }
    }

    const completedAt = this.clock.iso();
    append({
      kind: 'runtime_recovery_scan_completed',
      payload: {
        tmpOrphansRemoved,
        txReplayed: txOut.replayed.length,
        txRolledBack: txOut.rolledback.length,
        tasksMigrated,
        taskListsRepaired,
        staleRunningTasksBlocked,
        jobsRequeued,
        teamsFailed,
        teamsCancelled,
        teamsReclaimed,
        artifactWarnings,
      },
      at: completedAt,
    });

    // Persist recovery events to a diagnostics log.
    await ensureDir(this.paths.diagnosticsRoot());
    const log = path.join(this.paths.diagnosticsRoot(), 'recovery.jsonl');
    for (const e of events) {
      await appendJsonl(log, e);
    }

    return {
      startedAt,
      completedAt,
      tmpOrphansRemoved,
      txReplayed: txOut.replayed,
      txRolledBack: txOut.rolledback,
      tasksMigrated,
      taskListsRepaired,
      staleRunningTasksBlocked,
      jobsRequeued,
      teamsFailed,
      teamsCancelled,
      teamsReclaimed,
      artifactWarnings,
      events,
    };
  }
}

async function recoverTeam(
  team: Team,
  repo: TeamRepository,
  threadId: string,
  taskId: string,
  _paths: InstancePaths,
): Promise<Team> {
  if (team.status === 'forming') {
    const teammates = await repo.listTeammates(threadId, taskId, team.id);
    if (teammates.length === 0) {
      const next: Team = { ...team, status: 'cancelled' };
      await repo.saveTeam(next);
      return next;
    }
  }
  if (team.status === 'finishing' && !team.summary) {
    const next: Team = { ...team, status: 'failed' };
    await repo.saveTeam(next);
    return next;
  }
  return team;
}

/**
 * Scan `work-items/claimed/` for items whose `claimLeaseExpireAt` is past; if
 * `attemptCount < maxReclaims`, rename the file back into `available/` and
 * bump `attemptCount`. Past `maxReclaims`, move to `failed/`. Returns the
 * number of files moved.
 */
async function reclaimExpiredWorkItems(
  paths: InstancePaths,
  threadId: string,
  taskId: string,
  teamId: string,
  clock: Clock,
): Promise<number> {
  const { listJsonFilesSorted, readJson, atomicRename, atomicWriteJson } =
    await import('@ai-workflow/fs-store');
  const claimedDir = paths.teamWorkItemRoot(threadId, taskId, teamId, 'claimed');
  const files = await listJsonFilesSorted(claimedDir);
  let moved = 0;
  const now = clock.iso();
  for (const f of files) {
    const item = await readJson<{
      id: string;
      teamId: string;
      claimLeaseExpireAt?: string;
      attemptCount: number;
      maxReclaims: number;
    }>(f);
    if (!item) continue;
    const expAt = item.claimLeaseExpireAt ? Date.parse(item.claimLeaseExpireAt) : 0;
    if (!Number.isFinite(expAt) || expAt > Date.now()) continue;
    const nextAttempt = item.attemptCount + 1;
    const overflow = nextAttempt >= item.maxReclaims;
    const bucket = overflow ? 'failed' : 'available';
    const next = {
      ...item,
      status: bucket,
      claimedByTeammateId: undefined,
      claimedAt: undefined,
      claimLeaseExpireAt: undefined,
      attemptCount: nextAttempt,
      updatedAt: now,
    };
    const targetPath = paths.teamWorkItemFile(
      threadId,
      taskId,
      teamId,
      bucket,
      item.id,
    );
    // write to target then remove from claimed — prefer the more atomic rename
    // but the record content changed, so we write + unlink source.
    await atomicWriteJson(targetPath, next);
    try {
      await atomicRename(f, `${f}.reclaimed`);
    } catch {
      /* noop */
    }
    moved++;
  }
  return moved;
}
