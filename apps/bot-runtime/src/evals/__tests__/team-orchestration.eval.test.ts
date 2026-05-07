/**
 * TeamOrchestration eval. Verifies a deterministic "orchestration picker"
 * resolves each task description to one of {direct, subagent, team}, and
 * for team samples extracts an expected role roster (Acceptance #67).
 *
 * Thresholds (per v1 §10.1 #67):
 *   - 3-way accuracy        ≥ 0.80
 *   - team binary recall    ≥ 0.85
 *   - team binary precision ≥ 0.75
 *   - role micro-F1         ≥ 0.70
 */
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadJsonlDataset, persistResult } from '../harness.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DATASET = path.resolve(here, '../../../../../tests/evals/datasets/team-orchestration.jsonl');

const ROLE_VOCAB = [
  'researcher',
  'reviewer',
  'editor',
  'fact-checker',
  'tester',
  'analyst',
  'designer',
  'lead',
  // suffixed/multi-instance roles - listed explicitly so longest-prefix wins
  'coder-1', 'coder-2', 'coder-3', 'coder-4', 'coder-5', 'coder',
  'worker-1', 'worker-2', 'worker-3', 'worker-4', 'worker-5', 'worker-6', 'worker',
  'branch-a', 'branch-b', 'branch-c', 'branch-d',
];

function pickRoles(desc: string): string[] {
  const d = desc.toLowerCase();
  const found = new Set<string>();
  for (const role of ROLE_VOCAB) {
    // Match as a token (preceded by start/non-word, followed by end/non-word excluding '-')
    const re = new RegExp(`(^|[^\\w-])${role.replace(/[-\\/\\\\^$*+?.()|[\\]{}]/g, '\\\\$&')}([^\\w-]|$)`, 'i');
    if (re.test(d)) found.add(role);
  }
  // If a suffixed role matched (coder-1), drop the bare "coder" hit unless it
  // also appears separately (handled by token match already), so leave as-is.
  return [...found].sort();
}

function pick(desc: string): string {
  const d = desc.toLowerCase();
  // Team signals: explicit team/roster/pipeline language, or 2+ canonical
  // role keywords co-occurring, or "N workers" plurality, or branch fan-out.
  const teamKeywords =
    /\b(team|roster|pipeline|parallelize|parallel team|in parallel|fan-out|workers)\b/.test(d);
  const numWorkers = /\b\d+\s*workers?\b/.test(d);
  const roleHits = pickRoles(d);
  const multiRole = roleHits.length >= 2;
  const branchFanout = /\bbranch-[a-d]\b/.test(d);
  if (teamKeywords || numWorkers || multiRole || branchFanout) {
    return 'team';
  }
  if (
    /\b(spike|crawl|fuzz|background|research|investig|explore|sandbox-run|write-up)\b/.test(d)
  ) {
    return 'subagent';
  }
  return 'direct';
}

interface Row {
  id: string;
  input: { description: string };
  label: 'direct' | 'subagent' | 'team';
  roles?: string[];
}

describe('TeamOrchestration eval', () => {
  it('classifies into direct/subagent/team and extracts team roles meeting acceptance #67', () => {
    const rows = loadJsonlDataset<Row>(DATASET);
    expect(rows.length).toBe(150);

    const preds = rows.map((r) => pick(r.input.description));
    const predRoles = rows.map((r) => pickRoles(r.input.description));

    let correct = 0;
    let teamTruth = 0;
    let teamPred = 0;
    let teamTP = 0;
    let roleTP = 0;
    let roleFP = 0;
    let roleFN = 0;

    for (let i = 0; i < rows.length; i++) {
      const truth = rows[i]!.label;
      const p = preds[i]!;
      if (truth === p) correct++;
      if (truth === 'team') teamTruth++;
      if (p === 'team') teamPred++;
      if (truth === 'team' && p === 'team') teamTP++;
      if (truth === 'team') {
        const expected = new Set(rows[i]!.roles ?? []);
        const got = new Set(predRoles[i]!);
        for (const r of got) (expected.has(r) ? roleTP++ : roleFP++);
        for (const r of expected) if (!got.has(r)) roleFN++;
      }
    }

    const accuracy = correct / rows.length;
    const teamRecall = teamTruth === 0 ? 0 : teamTP / teamTruth;
    const teamPrecision = teamPred === 0 ? 0 : teamTP / teamPred;
    const roleMicroF1 =
      2 * roleTP + roleFP + roleFN === 0
        ? 0
        : (2 * roleTP) / (2 * roleTP + roleFP + roleFN);

    const result = {
      total: rows.length,
      correct,
      accuracy,
      teamRecall,
      teamPrecision,
      roleMicroF1,
      roleCounts: { tp: roleTP, fp: roleFP, fn: roleFN },
      teamCounts: { truth: teamTruth, predicted: teamPred, tp: teamTP },
    };
    persistResult('team-orchestration', result as any);

    expect(accuracy).toBeGreaterThanOrEqual(0.8);
    expect(teamRecall).toBeGreaterThanOrEqual(0.85);
    expect(teamPrecision).toBeGreaterThanOrEqual(0.75);
    expect(roleMicroF1).toBeGreaterThanOrEqual(0.7);
  });
});
