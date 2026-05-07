# my-space Product Review — "AI Employee" UX walk-through

Date: 2026-05-07  •  Branch: `bot1`  •  After P0–P4

---

## 1. Executive summary

my-space v1 clearly ships the promised "AI employee" form factor: a persistent Chinese-first workbench with a sidebar of ongoing conversations, a central chat, and a right-hand task drawer carrying plan/changes/log/team/artifact/retry tabs. All five key modals (plan confirm, change confirm, critical-node approval, Feishu config, channels) are implemented and wired to a centralized SSE+Zustand event bus with replay, degraded, and reload banners. The experience is coherent and feels like a working product — not a demo. Friction mostly lives in onboarding (README is thin, no first-run story), power-user ops (policies UI missing, artifact download disabled), and a few small visual / copy issues (missing assistant typing state, `window.prompt` for creating a thread, JSON-blob in critical-node modal). No P0 blocker to shipping, but three items below genuinely hurt first impressions and should be polished before launch.

## 2. Story-by-story walkthrough

### Story 1 — First-time setup  •  severity: **major** friction

Works: `.env.example` is present with sensible defaults (`LLM_PROVIDER=heuristic` so first-run is zero-config); `tooling/docker-compose.local.yml` covers runtime, web, Prometheus, Grafana; `tooling/scripts/smoke.sh` exercises the happy path; seed-dev-user script exists.

Friction:
- `README.md` is 26 lines. No quickstart, no "open `http://localhost:3000`", no mention of `.env.example`, no screenshot, no mention of the default dev token. A new user cannot get from clone → running UI without reading `init/requirement.md` (11k+ lines).
- Compose file has no `env_file: ../.env` line, so the `.env` variables the user fills in don't reach the containers — they have to re-export `DEV_BEARER` / `LOCAL_USER_TOKENS` manually.
- Feishu vars are in `.env.example` but the Feishu **bot app** credentials live in the UI config sheet, not `.env` — new users won't know which path to use. No guidance.

### Story 2 — First conversation  •  severity: minor

Works: empty state ("准备就绪 / 选择左侧会话或 + 新建对话 开始和 AI 员工协作") is warm and product-voiced. Heuristic guard makes first send work with no LLM keys. `GuardDecisionBadge` attaches to the user bubble once the decision arrives — this is genuinely a nice "AI is thinking about your intent" touch.

Friction:
- "+ 新对话" uses `window.prompt` (Sidebar.tsx L57). A prompt box in 2026 undermines the careful warm-beige design.
- No assistant-typing indicator between send and first SSE message.
- No onboarding hint on first paint — just "Ready / 开始对话". A 1-line "Try: `帮我整理今天的邮件` or `起草一份周报`" would unlock the product far faster.

### Story 3 — Confirm & watch execution  •  severity: minor

Works: `PlanConfirmModal` shows objective + numbered steps + 确认并开始 / 放弃, unambiguous. Status pill copy is excellent Chinese (草稿 / 已确认 / 队列中 / 运行中 / 阻塞 / 待审批). Plan progress section has colored step rings. Tool-call / log viewer exists via `LogViewer`. Artifact panel shows sha256, size, active/archived, preview.

Friction:
- Artifact **download** button is explicitly disabled ("v1 暂未实现下载链路", ArtifactPanel L207). This is a real product gap: users can see output exists but can't retrieve it outside the runtime workspace.
- Plan confirm has no "budget / risk" hint — confirmation is a single blind commit.

### Story 4 — Change mid-execution  •  severity: minor

Works: `ChangeConfirmModal` explicitly warns "此变更将归档当前 N 个产物" with the archive count, and shows change summary + new plan steps. `ChangeHistoryPanel` renders a timeline with revision pills and preview JSON. ChangeRecord link to trigger message is included in the data.

Friction:
- The change modal doesn't show a diff vs the old plan — user has to remember the old steps or open the change history panel separately.

### Story 5 — Critical-node approval  •  severity: moderate

Works: modal headline "需要人工确认" with matcher kind pill, reason, time. Approve / reject both toast-acknowledge.

Friction:
- The "详情" section is a raw `JSON.stringify(matcher)` pretty-printed block (CriticalNodeApprovalModal L58–60). For a non-technical user, "`{ "kind": "filesystem", "op": "delete", "minCount": 5 }`" reads as noise. Should render a human sentence: "AI 计划删除至少 5 个文件，需要你确认。"

### Story 6 — Team collaboration  •  severity: minor

Works: full RosterGrid with persona, status pill, current work item; 4-segment WorkItemSegments (available/claimed/completed/failed); MessageBusFeed with kind/from filters and auto-scroll; per-teammate events drawer; terminate-team + recovery-log buttons. This is the most polished section.

Friction:
- "who is teammate B vs teammate A" is shown as `mate:1a2b3c4d` short-IDs. Persona label exists but is optional and often empty in v1 fixtures. Consider a deterministic per-slot label like "成员 1 / 成员 2" as fallback.

### Story 7 — Feishu binding  •  severity: minor

Works: `FeishuConfigSheet` is clearly structured — enable toggle, app/name/operator/secrets, and `[已保存]` pill + `重新输入` affordance for rotating secrets without needing to type the old value. Toasts are localized (`配置已保存`). `ChannelsDrawer` separates binding lifecycle (binding / bound / failed) with `BindingStatusBadge`.

Friction:
- No "how do I get an app_id / app_secret?" link. The field labels read as jargon for anyone who hasn't set up a Feishu bot before.

### Story 8 — Blocked-task recovery  •  severity: minor

Works: `RetryCountdown` renders a ticking "N 秒后自动重试 → 正在重试…" label from `retry.nextRetryAt`. `TaskActions` reads `suggestedActions` from the `task_blocked` event and shows only the actions that apply (retry/skip/cancel), which is a sophisticated correctness touch. `RetryHistoryView` lists attempts with failure class pills.

Friction:
- `blockedReason` renders the raw machine code (`retry_pending`, `awaiting_user_action`, `non_idempotent_tool_in_flight`). Users should see human text: "等待重试中 / 等待你决定 / 工具未完成，等待确认". The danger panel in `TaskDetailPanel` prints it verbatim.

### Story 9 — Runtime crash  •  severity: minor

Works: `DegradedBanner` has three differentiated states — 降级 (warning), 补齐事件 `from–to` (warning), 缓冲溢出 with 立即重载 button (danger). SSE client has ack + replay + reload_required hooks. Poll loops pause while `replaying` is true so you don't fight the replay.

Friction: no visible "reconnected, all good" confirmation toast when the banner clears. Silent success leaves the user unsure.

### Story 10 — Policy management  •  severity: **major** (documented gap)

The `/policies` route loads the workbench with a persistent yellow strip: "策略管理 v1 通过 /api/critical-node-policies 配置，图形化面板暂缺". Honest, but for a "workbench" product, asking non-dev users to `curl` the API to add a policy is a hole. Acceptable only if the target customer is already engineering-led; otherwise it's a v1 blemish.

---

## 3. Top 5 product improvements (must-fix before ship)

1. **Expand README.md** — add 5-line quickstart (`cp .env.example .env`, `pnpm i && pnpm -w build`, `docker compose -f tooling/docker-compose.local.yml up`, open `localhost:3000`, default token is `dev-token`), plus a "first prompt" example. File: `/Users/eeo/code/my-space/README.md`.

2. **Humanize CriticalNodeApprovalModal** — replace the raw `JSON.stringify(matcher, null, 2)` block with a rendered sentence per matcher kind (filesystem / external_io / budget_overflow / …). File: `/Users/eeo/code/my-space/apps/web/components/workbench/CriticalNodeApprovalModal.tsx` L58–60.

3. **Implement artifact download** (or remove the disabled button) — right now every successful task ends with a visible "下载" button the user cannot click. Either ship `/api/artifacts/:id/download` or hide the button in v1. File: `/Users/eeo/code/my-space/apps/web/components/workbench/ArtifactPanel.tsx` L203–210.

4. **Replace `window.prompt` for new conversation** — swap for a small inline input or a proper modal consistent with the rest of the system. File: `/Users/eeo/code/my-space/apps/web/components/workbench/Sidebar.tsx` L54–69.

5. **Humanize blockedReason labels** — map `retry_pending / awaiting_user_action / non_idempotent_tool_in_flight / retry_exhausted` to Chinese user copy everywhere they surface (TaskDetailPanel.tsx summary section, TaskActions buttons, `blocked` badge). File: `/Users/eeo/code/my-space/apps/web/components/workbench/TaskDetailPanel.tsx` + the related `suggestedActions` consumer.

## 4. Top 5 acceptable v1 limitations

1. **Policies page is API-only** — documented via the yellow notice. Reasonable for a v1 shipped to an engineering-savvy audience.
2. **Artifact preview is JSON, not rendered** — `<pre>` is acceptable for v1 when most outputs are structured JSON / markdown; rich preview can wait.
3. **Plan diff not rendered visually in ChangeConfirmModal** — step list + archive count is enough signal for confirm/reject; side-by-side diff is v2.
4. **No assistant typing indicator** — the GuardDecisionBadge arriving within ~1s covers most of the "is it doing anything?" anxiety.
5. **Feishu setup requires external docs** — acceptable since Feishu bot creation is an external workflow with its own console.

## 5. Verdict

**Ship v1 after addressing Top-5 must-fixes (README + critical-node humanization + artifact-download decision + window.prompt + blockedReason copy).** The architecture and main flows are solid; only these five items are likely to damage first impressions. The `/policies` API-only hole is declared, not hidden, and is defensible. Everything else on the critique list is ≤moderate polish and fits a v1.1.

---

## Evidence index (read-only)

- Entry: `apps/web/app/page.tsx` → `components/workbench/WorkbenchPage.tsx`
- Shell: `components/workbench/WorkbenchShell.tsx` + `Sidebar.tsx` + `Header.tsx` + `TaskDrawer.tsx`
- Chat: `components/workbench/ChatWindow.tsx` + `MessageBubble.tsx` + `GuardDecisionBadge.tsx`
- Modals: `PlanConfirmModal.tsx`, `ChangeConfirmModal.tsx`, `CriticalNodeApprovalModal.tsx`, `FeishuConfigSheet.tsx`, `ChannelsDrawer.tsx`
- Task detail: `TaskDetailPanel.tsx` + `TaskDetailTabs.tsx` + `PlanProgressSection.tsx` + `ChangeHistoryPanel.tsx` + `ArtifactPanel.tsx` + `LogViewer.tsx` + `RetryHistoryView.tsx` + `TeamPanel.tsx`
- SSE/banner: `DegradedBanner.tsx` + `lib/sse-client.ts` + `lib/stores/sse.ts`
- Ops: `tooling/docker-compose.local.yml`, `tooling/scripts/{smoke.sh,seed-dev-user.mjs}`, `ops/grafana/{runtime,retry-dashboard}.json`, `docs/runbooks/{operations,retry-troubleshooting}.md`
- Config: `.env.example`, `apps/bot-runtime/src/config.ts`
- Policies fallback: `apps/web/app/policies/page.tsx` + PoliciesNotice in `WorkbenchPage.tsx`
