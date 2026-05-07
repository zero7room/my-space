/**
 * Lightweight eval harness for v1. Each eval reads a JSONL dataset under
 * `tests/evals/datasets/`, runs a per-row classifier, and reports
 * accuracy / F1 against thresholds. Vitest test files in `tests/evals` /
 * `apps/bot-runtime/src/evals/__tests__/` consume these helpers.
 *
 * `persistResult` writes a `tests/evals/results/<YYYY-MM-DD>/<name>.json`
 * snapshot so runs are auditable per the v1 §10.1 #50/#67 acceptance items.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export interface EvalRow<TInput = unknown, TLabel = string> {
  id: string;
  input: TInput;
  label: TLabel;
}

export function loadJsonlDataset<T extends EvalRow>(path: string): T[] {
  const raw = readFileSync(path, 'utf8');
  const rows: T[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    rows.push(JSON.parse(line) as T);
  }
  return rows;
}

export interface EvalResult {
  total: number;
  correct: number;
  accuracy: number;
  microF1: number;
  perLabel: Record<string, { tp: number; fp: number; fn: number; f1: number }>;
}

export function scoreClassification<T extends EvalRow<unknown, string>>(
  rows: T[],
  predicted: string[],
): EvalResult {
  if (rows.length !== predicted.length) {
    throw new Error('row/pred length mismatch');
  }
  const labels = new Set<string>();
  rows.forEach((r) => labels.add(r.label));
  predicted.forEach((p) => labels.add(p));

  const counts = new Map<string, { tp: number; fp: number; fn: number }>();
  for (const l of labels) counts.set(l, { tp: 0, fp: 0, fn: 0 });

  let correct = 0;
  for (let i = 0; i < rows.length; i++) {
    const truth = rows[i]!.label;
    const pred = predicted[i]!;
    if (truth === pred) {
      correct++;
      counts.get(truth)!.tp++;
    } else {
      counts.get(pred)!.fp++;
      counts.get(truth)!.fn++;
    }
  }

  let tpAll = 0, fpAll = 0, fnAll = 0;
  const perLabel: EvalResult['perLabel'] = {};
  for (const [l, c] of counts) {
    const prec = c.tp + c.fp === 0 ? 0 : c.tp / (c.tp + c.fp);
    const rec = c.tp + c.fn === 0 ? 0 : c.tp / (c.tp + c.fn);
    const f1 = prec + rec === 0 ? 0 : (2 * prec * rec) / (prec + rec);
    perLabel[l] = { tp: c.tp, fp: c.fp, fn: c.fn, f1 };
    tpAll += c.tp;
    fpAll += c.fp;
    fnAll += c.fn;
  }
  const microPrec = tpAll + fpAll === 0 ? 0 : tpAll / (tpAll + fpAll);
  const microRec = tpAll + fnAll === 0 ? 0 : tpAll / (tpAll + fnAll);
  const microF1 = microPrec + microRec === 0 ? 0 : (2 * microPrec * microRec) / (microPrec + microRec);

  return {
    total: rows.length,
    correct,
    accuracy: correct / rows.length,
    microF1,
    perLabel,
  };
}

const RESULTS_ROOT = path.resolve(process.cwd(), '../../tests/evals/results');

export function persistResult(name: string, result: EvalResult | Record<string, unknown>): string {
  const day = new Date().toISOString().slice(0, 10);
  const dir = path.join(RESULTS_ROOT, day);
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.json`);
  writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), result }, null, 2));
  return file;
}
