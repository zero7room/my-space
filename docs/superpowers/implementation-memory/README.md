# Implementation Memory

Working memory for the AI Workflow System V1 build. Consult `phase-status.md` for current state.

## Files

- `phase-status.md` — current phase, completion checklist, verification, next-phase entry
- `decisions.md` — durable architectural / implementation decisions
- `open-risks.md` — unresolved risks and mitigations
- `agent-handoffs/<phase>-<role>.md` — per-agent handoff notes
- `reviews/<phase>-review.md` — critical review per phase

## Rules

- Canonical sources win on conflict: `init/requirement.md`, `init/design.md`,
  `docs/superpowers/specs/2026-05-06-ai-workflow-system-v1-design.md`,
  `docs/superpowers/plans/2026-05-06-ai-workflow-system-v1.md`.
- Never write secrets, tokens, raw PII, or unredacted logs here.
- Append-only where practical; concise updates.
