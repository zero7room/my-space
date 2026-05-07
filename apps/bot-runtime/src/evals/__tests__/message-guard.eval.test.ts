/**
 * MessageGuard eval. Reads `tests/evals/datasets/message-guard.jsonl` and runs
 * the guard with no LLM (rule-only) against the labeled intents.
 *
 * v1 harness: thresholds are softened for the small bundled dataset (full
 * 200-sample set is generated separately during pre-release evals).
 */
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadJsonlDataset, scoreClassification } from '../harness.js';
import { MessageGuard, type GuardInput } from '../../thread-loop/message-guard.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DATASET = path.resolve(here, '../../../../../tests/evals/datasets/message-guard.jsonl');

interface MgRow {
  id: string;
  input: GuardInput;
  label: string;
}

describe('MessageGuard eval', () => {
  it('classifies the bundled labeled set with sufficient accuracy', async () => {
    const rows = loadJsonlDataset<MgRow>(DATASET);
    const guard = new MessageGuard();
    const preds: string[] = [];
    for (const r of rows) {
      const d = await guard.classify({
        ...r.input,
        threadId: 'th_aaaaaaaaaaaaaaaaaaaaa',
        messageId: 'ms_aaaaaaaaaaaaaaaaaaaaa',
      });
      preds.push(d.intent);
    }
    const result = scoreClassification(rows, preds);
    // Bundle is 10 rows; LLM-bound rows fall through to "chat".
    // Accept >= 0.6 here; full eval (200 rows) targets 0.9 / micro-F1 0.85.
    expect(result.accuracy).toBeGreaterThanOrEqual(0.6);
  });
});
