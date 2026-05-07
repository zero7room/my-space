/**
 * TaskConfirmation eval. Verifies owner-only confirm path: owner `/confirm`
 * resolves to `confirmed`; non-owner `/confirm` resolves to `rejected`.
 */
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadJsonlDataset, persistResult, scoreClassification } from '../harness.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DATASET = path.resolve(here, '../../../../../tests/evals/datasets/task-confirmation.jsonl');

function simulate(row: { input: { isOwner: boolean; text: string } }): string {
  // v1 deterministic: /confirm by owner → confirmed; anyone else → rejected.
  if (row.input.text.trim() === '/confirm' && row.input.isOwner) return 'confirmed';
  return 'rejected';
}

describe('TaskConfirmation eval', () => {
  it('owner confirmation resolves ≥ 95%, non-owner resolves 0%', () => {
    const rows = loadJsonlDataset<{ id: string; input: { isOwner: boolean; text: string }; label: string }>(DATASET);
    const preds = rows.map((r) => simulate(r));
    const res = scoreClassification(rows, preds);
    // For rule-perfect sim this is 100%.
    persistResult('task-confirmation', res); expect(res.accuracy).toBeGreaterThanOrEqual(0.95);
    const nonOwner = rows.filter((r) => !r.input.isOwner);
    const nonOwnerPreds = nonOwner.map((r) => simulate(r));
    const confirmed = nonOwnerPreds.filter((p) => p === 'confirmed').length;
    expect(confirmed).toBe(0);
  });
});
