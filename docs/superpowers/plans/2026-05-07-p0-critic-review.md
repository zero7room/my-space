# P0 Critic Review

Reviewer: P0 Critic (independent)
Scope: `apps/web/` after commits 52bef64 → f4e5d78
Authority: `init/requirement.md` §7 L526–548; `init/design.md` §3, §6.7, §14, §16, L2185; `docs/superpowers/plans/2026-05-07-full-gap-fix.md`.

## Executive summary

The P0 implementation is structurally complete: shell + sidebar + chat + drawer + tabs + modals + team panel + channels drawer + Feishu sheet + toast all render with the warm-beige theme tokens. Most of the visual surface area maps cleanly to requirement §7 L526–548 and the verbal contract from the plan. SSE ack heartbeat, replay banner, and reload_required handling are implemented and reasonable. Feishu config field set is complete. The Team panel is the strongest piece — full roster grid, four-segment work items, message bus filter, per-teammate drawer, approve/reject, terminate.

That said, **P0 is not ready to bless**. Three blockers stand out:

1. **TaskActions are not actually mounted in the workbench.** `TaskDetailPanel.SummarySection` still renders the literal placeholder text "操作按钮将在 P0-C 接入" (TaskDetailPanel.tsx:264-267). The `TaskActions` component exists and correctly implements the `suggestedActions` matrix from acceptance 32 / design L2185, but the workbench TaskDetailPanel never imports or renders it. Therefore, the entire user-facing surface for retry / skip / cancel / pause / resume / confirm is missing in the new workbench. Plan §P0-C step 1 is unimplemented.
2. **403/409 toast mapping is built on string matching, not `error.reason`.** `api-client.ts` throws `Error("${status} ${statusText}")` and discards the response body. `ToastProvider.showError` only branches on `msg.includes('403')` / `'409'`. Acceptance 42 requires mapping by `not_owner` / `invalid_state` / `terminal_state` — those literal strings appear nowhere in `apps/web/`. The bucket "权限拒绝：仅任务发起人可操作" fires for *any* 403, and "当前状态不允许此操作" for *any* 409 regardless of reason. This is a partial pass at best.
3. **Dual SSE clients fight for the same stream.** Both `WorkbenchPage` (line 282) and `ChatWindow` (line 128) instantiate independent `ThreadSseClient` instances against the same `threadId`. Both write into `useSseStore`, both fire `task_blocked` handlers, both send 10s ack heartbeats. This doubles network/IO, can produce duplicate `appendTaskEvent` writes (bypassing the dedupe check that lives only in ChatWindow's local message state), and risks divergent `lastSeenSeq` values. Either centralize the client in WorkbenchPage and have ChatWindow subscribe to a shared event bus, or keep one and remove the other.

Other meaningful gaps: ChangeRecord is not surfaced anywhere (requirement L537, design §6.5); retry-history view (design §16.4) is not rendered in the workbench; suggestedActions countdown (`nextRetryAt` display for `retry_pending`) is missing; the Sidebar collapse rule is keyed off `drawerOpen` instead of an explicit collapse state, which means opening the task drawer always slams the sidebar to icon-rail. Visual consistency is mostly good; banner / drawer / modal z-index stack is internally consistent (banner inside content area, drawer is `aside` sibling, modal `z-40`, toast `z-50`, channels drawer `z-30`, FeishuSheet `z-50`). The Feishu Sheet uses `z-50` and ChannelsDrawer's nested FeishuConfigSheet will overlap toast at the same z-index.

Verdict: **PASS WITH FIXES**. Three blockers (#1–#3) and ~6 medium issues must land before P1. Cosmetic items can defer.

## 1. Requirement §7 L526–548 line-by-line audit

- L532 对话视图 `[OK]` — `ChatWindow.tsx` renders user/assistant/system bubbles; `MessageBubble.tsx` separates roles; system messages center-aligned. Channel-synced messages also handled via `team_message_appended`/`message_appended`.
- L533 thread 视图（状态、上下文摘要、关联入口） `[WEAK]` — `Header.tsx` shows title + status pill but no context summary; no "关联入口" panel (links to bound channels, recent tasks, etc.). No surface that aggregates `thread.contextSummary`. Required: a thread metadata strip below header or in a thread-info popover.
- L534 TaskList 视图 `[OK]` — `TaskListPanel.tsx` shows confirmed tasks split active vs terminal; relies on `extractTaskRefs` defensive parsing. Polls every 3s.
- L535 active task 视图 `[WEAK]` — TaskDetailPanel works, but the only way to enter is through the list or deep-link. There's no header indicator / banner pointing the user to the active task with one click.
- L536 plan 视图（步骤、变更、时间线） `[OK]` — `PlanProgressSection.tsx` (compact + detailed) covers steps and counts; `ChangeHistoryPanel.tsx` is a real timeline with status pills and inline preview. Good.
- L537 变更历史面板（PlanRevision + 归档 artifact + ChangeRecord）`[WEAK]` — PlanRevision timeline ✅; archived artifact paths surfaced via `archivedArtifactPaths` / `archivedArtifactIds` ✅. **ChangeRecord is missing entirely** — `Grep "ChangeRecord"` returns 0 hits across `apps/web/`. Required by requirement §4.1.2 + design §6.5.
- L538 runtime 过程视图（工具调用、subagent、日志、产物、阻塞点） `[WEAK]` — `LogViewer.tsx` shows raw events.jsonl-style stream; tool calls + subagent events render as JSON dumps but with no semantic grouping or visual hierarchy. Blocked reason rendered in summary section. No first-class "tool call" or "subagent" view; both rely on the consumer parsing the JSON envelope.
- L539 确认交互（task / plan / 变更 / 关键节点 / 取消 / 暂停） `[GAP]` — Plan/change/critical-node modals exist (PlanConfirmModal, ChangeConfirmModal, CriticalNodeApprovalModal) and dispatch correctly. **Cancel / pause / retry / skip / confirm-task not exposed in the workbench TaskDetailPanel** — placeholder still in place at TaskDetailPanel.tsx:264-267. The standalone `TaskActions` component is correct but unmounted.
- L540 Channel 配置抽屉（启用/禁用、provider 配置、Secret 重新输入保存） `[OK]` — `ChannelsDrawer.tsx` + `FeishuConfigSheet.tsx`. SecretField "重新输入" toggle and overwrite-on-submit logic correct.
- L541 绑定状态视图（5 态）`[OK]` — `BindingStatusBadge.tsx` covers binding/bound/unbinding/failed/disabled (+ unknown fallback). Note: requirement also mentions "未配置 / 未绑定" states; ChannelsDrawer surfaces "暂无渠道绑定" (= 未绑定) but no explicit "未配置" indicator separate from `disabled`.
- L542 Secret 安全展示（仅 hasSecret 布尔） `[OK]` — FeishuConfigSheet.tsx never displays raw secret strings; `••••••••` placeholder + reentry button. Tolerates both `hasSecret` and `hasBotAppSecret` / `hasBotSigningSecret` shapes.
- L543 artifact panel（outputs/ 产物，可预览、下载） `[WEAK]` — ArtifactPanel.tsx lists active+archived artifacts, preview button toggles inline JSON dump, sha256 drift warning works. **Download button is hard-disabled** with title `"v1 暂未实现下载链路"` — requirement L543 lists download as required. Also: no path-based filter to ensure only `outputs/` are shown.
- L544 Team 面板（roster / work item 4-segment / message bus / per-teammate drawer） `[OK]` — `TeamPanel.tsx` (`WorkbenchTeamPanel`) covers all four sections plus team selector pills.
- L545 Teammate 审批 UI `[OK]` — RosterGrid renders approve/拒绝 buttons when teammate `status === 'awaiting_critical_node'`. Owner check is server-side only — UI doesn't gate on owner; minor MI exposure if a non-owner viewer can attempt.
- L546 Team 终止按钮 `[OK]` — `TeamActions.terminate` calls `api.cancelTeam`, gated on `forming|active|finishing`, with a `window.confirm` guard.

## 2. Acceptance item audit

### Acceptance 32 (task_blocked suggestedActions → button mapping; design L2185)
- `[GAP]` Buttons not mounted into TaskDetailPanel (see executive #1). No code path renders the action set in the workbench right now.
- `[OK]` `TaskActions.tsx` logic is correct: `suggestedActions` from `useTasksStore.blocked` is the authoritative source when present; falls back to status+blockedReason matrix otherwise. `retry_exhausted → cancel only`, `awaiting_user_action / non_idempotent_tool_in_flight → retry/skip/cancel`. Non-suggested status path also disables `pause` once `hasSuggested` (line 97), which is sensible.
- `[GAP]` `retry_pending` countdown to `nextRetryAt` is not implemented — design L1676 specifies a countdown display next to cancel; `nextRetryAt` is never read in the web app (`Grep` finds 0 hits).
- `[GAP]` Spec L1711: "task_blocked + suggestedActions 状态在断线期间必须从本地缓存读取，重连补齐后再以 server payload 覆盖". `useTasksStore` is in-memory only (zustand without persist). After tab refresh, blocked state vanishes until SSE replay arrives. Should persist via localStorage or hydrate from REST snapshot.

### Acceptance 41 (SSE ack / replay / reload; design §16.1–16.3)
- `[OK]` 10s ack POST: `sse-client.ts:111-129` `sendAck()` posts `{cursor, ackedAt}` to `/api/threads/{id}/ack` every `DEFAULT_ACK_MS = 10_000`. Default matches `RUNTIME_SSE_ACK_INTERVAL_MS`.
- `[OK]` `sse_ack_missing` → `setDegraded(true)` (sse-client.ts:96).
- `[OK]` `sse_replay_emitted` → degraded banner shows "正在补齐事件 N – M" via `DegradedBanner.tsx:24-32`. Note: spec says "补齐 N 条事件"; current copy reads "补齐事件 N – M" (start–end IDs). Acceptable variant; spec wording not sacrosanct.
- `[OK]` `sse_replay_truncated` → `setReloadRequired(true)`; DegradedBanner shows blocking banner with `立即重载` button. ChatWindow's reload-required effect (lines 144-157) clears messages and restarts client.
- `[GAP]` Catch-up "界面更新暂停"（spec L1710）: only the *banner* visualizes catch-up; the rest of the UI (task list polling, plan progress polling) keeps running normally during replay. Spec says "停止当前 UI 增量更新".
- `[CRITICAL]` Dual SSE clients (executive #3): `WorkbenchPage` and `ChatWindow` both instantiate `ThreadSseClient`. Both will POST `/ack` every 10s for the same connection (2× ack rate, server tracks per-connection but not per-client; could confuse server bookkeeping). Duplicate event dispatch: `WorkbenchPage.handleEvent` and `ChatWindow.handleEvent` both call `setBlocked` for `task_blocked`; duplicate `appendTaskEvent` writes happen too (only `WorkbenchPage` writes to taskEvents, but if the user navigates back/forth the cleanup race could leave both alive).
- `[WEAK]` `cursor=<lastEventId>` resumption: client uses `sinceSeq` as a query param `since=` (sse-client.ts:43). Spec uses `cursor=`. Server may accept both, but `API_ROUTES.threads.events` doesn't enforce naming. If the server expects `cursor`, current client will resume from 0 every reconnect. Verify server contract.

### Acceptance 42 (403/409 reason → toast; not_owner / invalid_state / terminal_state)
- `[GAP]` See executive #2. Body of error response is discarded by `api-client.ts`. The literals `not_owner`, `invalid_state`, `terminal_state` are not present anywhere in `apps/web/`. Required fix: parse JSON `{error: {reason, message}}` body in `get`/`post` and re-throw a typed error; have `showError` branch on `err.reason`.
- Current behavior: any 403 → "权限拒绝：仅任务发起人可操作"; any 409 → "当前状态不允许此操作". Misleading for non-owner-related 403s and other 409 conflicts (e.g. `cursor_too_old`).

### Acceptance 55 (artifact drift; sha256 red border + reseal)
- `[OK]` `artifact_consistency_warning` SSE event → `markArtifactDrifted(artifactId, reason)` (WorkbenchPage.tsx:256-264) + showInfo toast.
- `[OK]` Drifted artifact shows `border-danger border-2` and a red banner with reason (ArtifactPanel.tsx:159-167).
- `[OK]` Reseal: `api.resealArtifact` POST `/api/artifacts/{id}/reseal`; button labeled "重算 sha256". UI does not auto-clear drift state on success — relies on refresh which re-reads task; acceptable since server-side reseal should clear server-side flag, but `useTasksStore.driftedArtifacts` stays populated. Consider calling `clearArtifactDrift(id)` after a successful reseal.

### Acceptance 67 / 68 / 44 (Team panel + per-teammate approval + work item segments)
- `[OK]` All three items satisfied by `TeamPanel.tsx`.
- `[OK]` Owner-only terminate: client uses `window.confirm`; backend returns 403 if not owner — at which point the broken showError mapping (Acceptance 42 gap) misroutes the message. Same fix unblocks both.

### Acceptance 50/51/52/53/54/56 (channel config / binding states / Feishu fields)
- `[OK]` BindingStatusBadge five states.
- `[OK]` Feishu fields all 6 present (enabled, botAppId, botAppSecret, botSigningSecret, botName, operatorOpenId).
- `[OK]` GET configs only consumes `hasBotAppSecret` / `hasBotSigningSecret` (with `hasSecret` fallback) — never displays plaintext.
- `[WEAK]` Acceptance 56 reseal endpoint surfaced; download endpoint not surfaced (button hard-disabled).

### Acceptance 69 (retry history view; design §16.4)
- `[GAP]` `api.retryHistory` exists in api-client.ts but is **never called** by any workbench component. `RetryHistoryPanel.tsx` exists in `components/` (legacy) but isn't imported anywhere in workbench. The TaskDetailTabs has 6 tabs but no Retry tab; the summary section shows `retry.attemptCount/maxRetries` only.

## 3. Design §14 Feishu config

- `[OK]` Six fields per L1614: enabled / botAppId / botAppSecret / botSigningSecret / botName / operatorOpenId.
- `[OK]` Read-only path uses hasBotAppSecret / hasBotSigningSecret booleans (FeishuConfigSheet.tsx:73-85).
- `[OK]` Re-enter flow: SecretField shows `••••••••` + 重新输入 button when `stored && !editing`, switches to password input on toggle.
- `[OK]` Save flow: only sends `botAppSecret` / `botSigningSecret` keys when `editFoo && value.trim().length > 0` (FeishuConfigSheet.tsx:143-148). Empty / unchanged secret → not transmitted. Good.
- `[WEAK]` No "测试连接" / health-check button. Not strictly required by spec but UX-relevant for first config.
- `[WEAK]` `enabled=false` does not visually disable inputs — user can edit fields while disabled toggle is set, and the form will still POST them. Minor.

## 4. Team panel §4.9–4.12 + §7 L544

- `[OK]` Roster grid (4 cols on xl), persona / status pill / current work item, mate-card click → drawer.
- `[OK]` Work item segments: available / claimed / completed / failed (4 columns), counts, per-card preferredRole + priority + attemptCount + claimedBy.
- `[OK]` Message bus feed: filter chips (all / from:lead / to:broadcast / kind:5 types), expand/collapse for >200 chars, auto-scroll to bottom.
- `[OK]` Per-teammate events drawer: NDJSON / array / `{events:[]}` parsing tolerant; collapsible event details; status pill + persona + budget + summary in header.
- `[OK]` Approve/Reject buttons appear when teammate status is `awaiting_critical_node`.
- `[OK]` Terminate team button: gated on team status, confirm dialog, busy state.
- `[WEAK]` Recovery log surface is functional but minimal — pre-block dump only. Spec design §6 indicates this should be more semantically grouped.

## 5. Styling consistency

- `[OK]` `globals.css` defines design tokens via `@theme`; tailwind v4 uses `bg-surface`, `text-foreground`, etc. consistently.
- `[OK]` Pill / panel / card radii from `--radius-pill / panel / card`.
- `[WEAK]` A few hardcoded colors slipped through: WorkbenchShell.tsx:23, 31, 41 use `bg-[rgba(255,250,243,0.72)]` and similar inline values. These should be a token (`--color-surface-glass` or `bg-surface-raised/72`).
- `[WEAK]` Mixed shadow declarations: `shadow-soft` token used widely; but Sidebar.tsx:98, 130 use raw `shadow-[0_8px_18px_rgba(90,68,42,0.06)]` which is the same value as the token. Cleanup nit.
- `[OK]` Rounded corners: `rounded-pill / panel / card` consistent across components.
- `[OK]` Focus rings via outline-none + accent: most inputs use `outline-none`; TextField doesn't have a focus ring at all (FeishuConfigSheet TextField). Minor accessibility gap.
- `[OK]` Dark mode out of scope; `:root { color-scheme: light }` declared.
- `[WEAK]` `Header.tsx` shows raw `status` string from thread (line 31-34). If `status === "draft"`, user sees literal English `draft` in header pill. Localize.

## 6. Runtime correctness risks

- `[CRITICAL]` Dual SSE clients (acceptance 41 + executive #3). 2× ack rate, duplicate dispatch, race on close.
- `[MAJOR]` `ChatWindow` reload-required effect (lines 144-157) creates a new `ThreadSseClient` *outside* of the regular threadId-effect dependency chain. The new client is then closed in the regular effect's cleanup, but also if `reloadRequired` flips again. Two effects writing to `clientRef.current` → race window where we double-close or leak.
- `[MAJOR]` `Sidebar` collapses to the icon rail whenever `drawerOpen` is true (line 87). User has no way to keep the full sidebar visible while the task drawer is open. Should be a separate `sidebarCollapsed` flag.
- `[MAJOR]` `WorkbenchPage.handleEvent` handles `plan_drafted` and `plan_revising` by calling `api.getPlanRevision`. If the SSE replay buffer fires `plan_drafted` twice during catch-up, two modals will open back-to-back; the second `setPlanConfirm` call replaces the first and hides any user click without persisting their choice. Should debounce/dedupe by `revisionId`.
- `[MAJOR]` `useToastStore.setTimeout` (ToastProvider.tsx:16) doesn't store the timeout id. If the user dismisses a toast manually, the timer still fires and tries to filter an already-removed item — harmless but visible in console under StrictMode double-invoke.
- `[MAJOR]` `api-client.ts` discards response bodies on error. `.catch()` recipients receive `Error("403 Forbidden")` and lose all backend reason data. Affects every action endpoint.
- `[MAJOR]` `TaskListPanel` polls every 3 s with `api.listThreads()`. With many threads, this is a heavy GET; should narrow to a single-thread endpoint or rely on SSE for task list updates.
- `[MAJOR]` `ArtifactPanel.refresh` does `Promise.all(ids.map(getArtifact))` — for a task with hundreds of artifacts this fires hundreds of parallel requests. Add concurrency cap.
- `[MAJOR]` `LogViewer` reads from a 500-cap circular buffer (`useSseStore.appendTaskEvent`). After 500 events, oldest are silently truncated, no warning surfaced. For long-running tasks this is misleading.
- `[MINOR]` ChannelsDrawer transition: drawer mount is gated on `if (!open) return null` (line 71) so the `transition-transform translate-x-0/full` never animates — element appears/disappears instantly.
- `[MINOR]` `CreateBindingModal` z-index: `z-50`. ChannelsDrawer is `z-30` so the modal appears on top, but FeishuConfigSheet inside the drawer is also `z-50` — siblings at the same z compete on DOM order.
- `[MINOR]` `useEffect` cleanups: most effects that start polling are cleaned up correctly. `WorkbenchPage`'s init-once `initRanRef.current` will leak the `getTask` promise's setState if the component unmounts before resolution.
- `[MINOR]` `TaskListPanel` "showTerminal" toggle resets to false on re-mount; not persisted.

## 7. Gaps requiring fix BEFORE P1

1. **TaskDetailPanel.tsx:262-268** — Replace placeholder block with `<TaskActions taskId={taskId} status={task.status} blockedReason={task.blockedReason} />`. Acceptance 32 / 39 currently fully blocked. (Plan §P0-C step 1.)
2. **api-client.ts:31, 45** — On `!res.ok`, attempt to `await res.json()`, attach as `{ status, reason, message }` to a typed error, and re-throw. Update `ToastProvider.showError` to map `reason ∈ {not_owner, invalid_state, terminal_state, ...}` to localized messages. Acceptance 42 unblocks.
3. **WorkbenchPage.tsx:275-295 + ChatWindow.tsx:121-141** — Centralize the `ThreadSseClient` to a single owner. Suggested: keep WorkbenchPage's client as the one true source; have ChatWindow read messages from the store via a new `messages` slice instead of running its own connection. Otherwise dispatching `task_blocked` and `appendTaskEvent` happens twice.
4. **TaskDetailPanel + TaskDetailTabs** — Add a "重试历史" tab (or panel inside Summary) wired to `api.retryHistory(taskId)`. Acceptance 69 + design §16.4. The legacy `RetryHistoryPanel` already exists in `apps/web/components/` and can be re-used.
5. **ChangeHistoryPanel.tsx** — Surface `ChangeRecord` entries: requirement L537 + design §6.5. Either inline next to PlanRevision items (correlating by `changeRecordId` if backend exposes), or as a separate tab. Currently zero references in the web app.
6. **TaskActions.tsx** — Add `nextRetryAt` countdown for `retry_pending`. Read from `task.retry.nextRetryAt` or from `useTasksStore.blocked[taskId].nextRetryAt` (extend BlockedInfo). Spec L1676.
7. **WorkbenchShell + Sidebar** — Add explicit `sidebarCollapsed` flag in conversations store; decouple from `drawerOpen`. Currently opening the task drawer auto-collapses the sidebar with no recourse.
8. **DegradedBanner** — When `replaying`, pause polling effects in TaskListPanel / PlanProgressSection / ArtifactPanel to satisfy spec L1710 ("停止当前 UI 增量更新"). At minimum, suppress fetch errors so polling failures don't pile up while replay is in flight.
9. **WorkbenchPage.handleEvent** — Dedupe modal openings by `revisionId`: `if (planConfirm?.revisionId === revisionId) return;`. Otherwise replay-mode events spawn multiple modal pops.
10. **ArtifactPanel** — Filter to only paths under `outputs/` (requirement L543: "仅展示 outputs/ 目录下的产物") before rendering. Today every artifact regardless of path is shown.
11. **ArtifactPanel.handleReseal** — Call `clearArtifactDrift(a.id)` on success so the local store reflects the reseal.
12. **api-client.ts** — Tighten typing: replace `Promise<unknown>` returns with the proper response types (`PlanRevision`, `ArtifactDto`, etc. from `@ai-workflow/contracts`). Currently `getPlanRevision`, `getArtifact`, `listChannelConfigs`, `putChannelConfig`, `createBinding`, `cancelTeam`, `approveTeammate`, `rejectTeammate`, `teammateEvents`, `teamEvents`, `recoveryLog`, `createPolicy`, `updatePolicy` all return `unknown`. Many UI bugs will hide here.

## 8. Deferred items (acceptable now)

1. Artifact preview is a JSON dump — adequate for V1; rich preview (text/markdown/image) can land later.
2. Download button stays disabled until backend exposes a download URL contract.
3. Policies page is a no-op notice referring to `/api/critical-node-policies`. Plan acknowledges no GUI in this round.
4. ChannelsDrawer `重试` button is a no-op `showInfo` — okay for V1.
5. `Header.tsx` shows raw `status` string in English — localize during P1 polish.
6. Team panel recovery log dump is plain `<pre>` — semantic grouping can defer.
7. LogViewer 500-event cap is fine for V1; surface a "+N truncated" warning later.
8. CreateBindingModal does not validate externalConversationId format — backend will 4xx; toast suffices.
9. Auto-scroll-to-bottom on chat may fight with user scroll-up; current behavior matches DeerFlow reference.
10. No keyboard shortcut for opening task drawer; click-only is acceptable for V1.

## Verdict

**PASS WITH FIXES** — Items #1–#3 in §7 are blockers for any user-facing acceptance test of P0. Items #4–#11 are required to satisfy the literal acceptance matrix the plan promises. Items in §8 are acceptable to defer. Once #1–#11 land, the workbench should hold up to a P1 review.
