# Bot-Runtime Evals

Three required eval paths from Spec 12.3:

1. **message-guard** — 200 samples, intent classification accuracy ≥ 90%
2. **task-confirmation** — 50 samples, transition signal accuracy ≥ 90%
3. **plan-revision** — 30 samples, revision-vs-update gating accuracy ≥ 90%

## Run an eval

Stub mode (no API key needed; deterministic baseline):

    pnpm --filter @ai-employee/bot-runtime eval -- --eval message-guard

Live mode (real Anthropic LLM):

    ANTHROPIC_API_KEY=sk-... pnpm --filter @ai-employee/bot-runtime eval -- --eval message-guard

## Output

Results are written to `tests/evals/results/<YYYY-MM-DD>/<eval-name>.json`. The file
contains `total`, `passed`, `passRate`, and a `failureSamples` array with
`{ sampleId, expected, actual, error? }` for each miss.

## Pass thresholds

- `message-guard` stub: ≥0.95 (deterministic should be 1.0)
- `message-guard` live: ≥0.90 (Spec 12.3 requirement)
- `task-confirmation`, `plan-revision`: ≥0.95 stub, ≥0.90 live (Spec 12.3)

## Adding samples

Use `scripts/gen-message-guard-samples.ts` as a template. Drop the resulting
JSONL into `tests/evals/samples/<eval-name>.jsonl`.
