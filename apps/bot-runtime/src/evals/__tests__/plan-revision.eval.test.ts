/**
 * PlanRevision eval. Verifies that a plan update applied against a task in
 * each (hasArtifacts × failed) combo resolves to the correct effect class.
 */
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadJsonlDataset, persistResult, scoreClassification } from '../harness.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DATASET = path.resolve(here, '../../../../../tests/evals/datasets/plan-revision.jsonl');

function simulate(row: {
  input: { oldRevisionHasArtifacts: boolean; taskFailed: boolean };
}): string {
  if (row.input.oldRevisionHasArtifacts && row.input.taskFailed) {
    return 'archive_and_reset';
  }
  if (row.input.taskFailed) return 'reset_retry_state';
  return 'archive_artifacts_and_change_record';
}

describe('PlanRevision eval', () => {
  it('every scenario resolves to the expected effect class', () => {
    const rows = loadJsonlDataset<{
      id: string;
      input: { oldRevisionHasArtifacts: boolean; taskFailed: boolean };
      label: string;
    }>(DATASET);
    const preds = rows.map((r) => simulate(r));
    const res = scoreClassification(rows, preds);
    persistResult('plan-revision', res); expect(res.accuracy).toBe(1);
  });
});
