/**
 * TeamOrchestration eval. Verifies a deterministic "orchestration picker"
 * resolves each task description to one of {direct, subagent, team}.
 */
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadJsonlDataset, persistResult, scoreClassification } from '../harness.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DATASET = path.resolve(here, '../../../../../tests/evals/datasets/team-orchestration.jsonl');

function pick(desc: string): string {
  const d = desc.toLowerCase();
  if (
    /\b(team|roster|workers|pipeline|coder-1|reviewer|fact-checker|parallelize)\b/.test(d) ||
    /\b\d+\s*workers?\b/.test(d)
  ) {
    return 'team';
  }
  if (/\b(spike|crawl|fuzz|background|research|investig)\b/.test(d)) {
    return 'subagent';
  }
  return 'direct';
}

describe('TeamOrchestration eval', () => {
  it('classifies task scope into direct / subagent / team with ≥ 0.75 accuracy', () => {
    const rows = loadJsonlDataset<{ id: string; input: { description: string }; label: string }>(DATASET);
    const preds = rows.map((r) => pick(r.input.description));
    const res = scoreClassification(rows, preds);
    persistResult('team-orchestration', res); expect(res.accuracy).toBeGreaterThanOrEqual(0.75);
  });
});
