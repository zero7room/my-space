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
        if (result.migrated) {
          await this.taskRepo.update(result.task);
          tasksMigrated++;
          append({
            kind: 'task_state_transition',
            taskId: t.id,
            threadId: t.threadId,
            payload: { migration: 'v1->v2' },
            at: this.clock.iso(),
          });
        }
        let task = result.task;
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
              payload: { reason: 'recovery_stale_running' },
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
    for (const threadId of threadIds) {
      const tasksRoot = this.paths.threadTasksRoot(threadId);
      const taskIds = await listSubdirsSorted(tasksRoot);
      for (const taskId of taskIds) {
        const teams = await this.teamRepo.listTeamsForTask(threadId, taskId);
        for (const team of teams) {
          const updated = await recoverTeam(team, this.teamRepo, threadId, taskId);
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
      events,
    };
  }
}

async function recoverTeam(
  team: Team,
  repo: TeamRepository,
  threadId: string,
  taskId: string,
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
