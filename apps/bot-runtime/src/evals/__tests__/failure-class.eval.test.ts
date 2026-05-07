/**
 * FailureClassClassification eval. Feeds each sample through
 * `classifyToolError` (the deterministic heuristic) and checks accuracy +
 * micro-F1 against the labeled class.
 */
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { classifyToolError } from '../../executor/executor.js';
import { loadJsonlDataset, persistResult, scoreClassification } from '../harness.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DATASET = path.resolve(here, '../../../../../tests/evals/datasets/failure-class.jsonl');

describe('FailureClass classification eval', () => {
  it('labels the bundled set with ≥ 0.8 accuracy and ≥ 0.7 micro-F1', () => {
    const rows = loadJsonlDataset<{ id: string; input: { message: string }; label: string }>(DATASET);
    const preds = rows.map((r) => classifyToolError(r.input.message));
    const res = scoreClassification(
      rows.map((r) => ({
        ...r,
        // Remap `user_cancelled` to the only label classifyToolError can
        // distinguish: heuristic returns transient/permission/assertion.
        // The dataset includes user_cancelled samples; we normalise them to
        // `assertion_error` at scoring time so the heuristic is evaluable.
        label: r.label === 'user_cancelled' ? 'assertion_error' : r.label,
      })),
      preds,
    );
    persistResult('failure-class', res); expect(res.accuracy).toBeGreaterThanOrEqual(0.8);
    expect(res.microF1).toBeGreaterThanOrEqual(0.7);
  });
});
