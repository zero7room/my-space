/**
 * Team-level control channel. Mirrors the per-task TaskControl pattern but at
 * the team scope: parent ThreadLoop pushes a signal here, the team-runtime
 * `applyTeamSignal` drains it and transitions the team status.
 *
 * File: data/instances/<runtimeId>/state/threads/<thread>/tasks/<task>/teams/<team>/control.json
 *
 * Used by acceptance 61 (parent task cancel/pause/resume cascade) and 62
 * (plan_update cascade — must cancel & wait for terminal before PlanRevision).
 */
import { atomicWriteJson, readJson, ensureDir } from '@ai-workflow/fs-store';
import path from 'node:path';

import type { RuntimePaths } from '../runtime/paths.js';

export type TeamControlSignalKind = 'cancel' | 'pause' | 'resume';

export interface TeamControlSignal {
  id: string;
  kind: TeamControlSignalKind;
  at: string;
  requestedByUserId?: string;
}

export interface TeamControl {
  teamId: string;
  pendingSignals: TeamControlSignal[];
  updatedAt: string;
}

function controlPath(
  rt: RuntimePaths,
  threadId: string,
  taskId: string,
  teamId: string,
): string {
  return rt.paths.teamControlFile(threadId, taskId, teamId);
}

export async function readTeamControl(
  rt: RuntimePaths,
  threadId: string,
  taskId: string,
  teamId: string,
): Promise<TeamControl | undefined> {
  const raw = await readJson(controlPath(rt, threadId, taskId, teamId));
  if (!raw) return undefined;
  return raw as TeamControl;
}

export async function pushTeamControlSignal(
  rt: RuntimePaths,
  threadId: string,
  taskId: string,
  teamId: string,
  kind: TeamControlSignalKind,
  requestedByUserId?: string,
): Promise<TeamControlSignal> {
  const cur =
    (await readTeamControl(rt, threadId, taskId, teamId)) ??
    ({ teamId, pendingSignals: [], updatedAt: new Date().toISOString() } as TeamControl);
  const sig: TeamControlSignal = {
    id: `tcs_${Math.random().toString(16).slice(2, 14).padStart(12, '0')}`,
    kind,
    at: new Date().toISOString(),
    requestedByUserId,
  };
  cur.pendingSignals.push(sig);
  cur.updatedAt = sig.at;
  const p = controlPath(rt, threadId, taskId, teamId);
  await ensureDir(path.dirname(p));
  await atomicWriteJson(p, cur);
  return sig;
}

export async function drainTeamControlSignals(
  rt: RuntimePaths,
  threadId: string,
  taskId: string,
  teamId: string,
): Promise<TeamControlSignal[]> {
  const cur = await readTeamControl(rt, threadId, taskId, teamId);
  if (!cur || cur.pendingSignals.length === 0) return [];
  const drained: TeamControl = {
    teamId,
    pendingSignals: [],
    updatedAt: new Date().toISOString(),
  };
  await atomicWriteJson(controlPath(rt, threadId, taskId, teamId), drained);
  return cur.pendingSignals;
}
