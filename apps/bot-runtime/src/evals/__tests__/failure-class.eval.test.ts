/**
 * FailureClassClassification eval (acceptance §10 #50a).
 *
 * Runs `classifyToolError` over a ≥200-row 4-class dataset
 * (transient_error / assertion_error / permission_error / user_cancelled,
 * each ≥50) with adversarial / boundary samples mixed in and enforces the
 * v1 release thresholds:
 *   accuracy ≥ 0.90, micro-F1 ≥ 0.85.
 * Falling below blocks release; misses should be folded back into the
 * classifier patterns / prompt few-shot examples.
 */
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { classifyToolError } from '../../executor/executor.js';
import { loadJsonlDataset, persistResult, scoreClassification } from '../harness.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DATASET = path.resolve(here, '../../../../../tests/evals/datasets/failure-class.jsonl');

describe('FailureClass classification eval', () => {
  it('labels the ≥200-row 4-class set with ≥ 0.90 accuracy and ≥ 0.85 micro-F1', () => {
    const rows = loadJsonlDataset<{ id: string; input: { message: string }; label: string }>(DATASET);
    expect(rows.length).toBeGreaterThanOrEqual(200);
    const perLabelTruth = rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.label] = (acc[r.label] ?? 0) + 1;
      return acc;
    }, {});
    for (const label of ['transient_error', 'assertion_error', 'permission_error', 'user_cancelled']) {
      expect(perLabelTruth[label] ?? 0).toBeGreaterThanOrEqual(50);
    }
    const preds = rows.map((r) => classifyToolError(r.input.message));
    const res = scoreClassification(rows, preds);
    persistResult('failure-class', res);
    expect(res.accuracy).toBeGreaterThanOrEqual(0.9);
    expect(res.microF1).toBeGreaterThanOrEqual(0.85);
  });
});
