# Claude Code Final Self-Check Prompt

所有功能都已实现。现在请进行一次全面自检测、验收、问题修复和最终验证。

你必须先阅读以下权威文档：

1. `init/requirement.md`
2. `init/design.md`
3. `docs/superpowers/specs/2026-05-06-ai-workflow-system-v1-design.md`
4. `docs/superpowers/plans/2026-05-06-ai-workflow-system-v1.md`
5. `docs/superpowers/implementation-memory/phase-status.md`
6. `docs/superpowers/implementation-memory/decisions.md`
7. `docs/superpowers/implementation-memory/open-risks.md`
8. `docs/superpowers/implementation-memory/reviews/`
9. `docs/superpowers/implementation-memory/agent-handoffs/`

目标：不要假设实现已经正确。请以准备上线前验收的标准，重新验收整个 AI Workflow System V1，找出缺口、失败项、回归风险、未覆盖测试和文档不一致，并修复所有 Critical / Important 问题。

## 执行方式要求

本次自检测必须使用 Agent Teams / 多 SubAgent 并行完成，而不是由单一 agent 顺序检查。你需要组建一个自检团队，并由 Lead Reviewer 汇总结果、分派修复、复验。

至少包含以下角色：

1. Product Acceptance Reviewer
   - 对照 `init/requirement.md` §10.1 的 1-69 项逐项验收。
   - 每项必须给出 evidence：代码路径、测试路径、运行结果或风险说明。

2. Architecture Consistency Reviewer
   - 对照 `init/design.md` 检查模型、状态机、文件系统布局、ThreadLoop、Executor、retry、SSE、Channel、CriticalNodePolicy、Agent Teams 是否一致。

3. Runtime / Persistence Reviewer
   - 检查 `apps/bot-runtime` 的 fs-store、transactions、locks、recovery、TaskList、PlanRevision、ArtifactRecord、retry scheduler、events archive、Team recovery。

4. API / Channel Reviewer
   - 检查 Fastify API、owner-first auth、critical-node approve/reject、Feishu webhook、ChannelProvider、Guardian、webhook idempotency、outbound jobs、secret redaction、notify throttling。

5. Frontend Reviewer
   - 检查 `apps/web` 的 chat、thread、TaskList、active task、plan、artifact、blocked action panel、channel drawer、Team panel、SSE ack/replay/reconnect。

6. Agent Teams Reviewer
   - 检查 `team` 工具、8 个 team 内工具、claim/reclaim、teammate loop、message bus、finish_team、parent cancel/pause/plan_update 级联、Team SSE、Team metrics、TeamOrchestration eval。

7. Eval / Test Reviewer
   - 检查 unit/integration/E2E/eval 覆盖。
   - 特别检查五条强制 eval：MessageGuard、TaskConfirmation、PlanRevision、FailureClassClassification、TeamOrchestration。

8. Security / Ops Reviewer
   - 检查 secrets/PII/sanitize、path traversal、bash workspace 限制、Feishu signature、CriticalNodePolicy、metrics、OTel、Grafana、runbooks、Docker、CI。

## 持久化自检记录

Lead Reviewer 必须维护：

`docs/superpowers/implementation-memory/final-self-check.md`

各 reviewer 必须输出结构化报告到：

```text
docs/superpowers/implementation-memory/reviews/final-product-acceptance.md
docs/superpowers/implementation-memory/reviews/final-architecture-consistency.md
docs/superpowers/implementation-memory/reviews/final-runtime-persistence.md
docs/superpowers/implementation-memory/reviews/final-api-channel.md
docs/superpowers/implementation-memory/reviews/final-frontend.md
docs/superpowers/implementation-memory/reviews/final-agent-teams.md
docs/superpowers/implementation-memory/reviews/final-eval-test.md
docs/superpowers/implementation-memory/reviews/final-security-ops.md
```

`final-self-check.md` 需要记录：

1. 检查时间
2. 参与 agents / reviewers
3. 每个检查维度的结论
4. 发现的问题列表，按 Critical / Important / Minor 分类
5. 每个问题的修复状态
6. 每条验证命令的结果
7. 最终 acceptance checklist

不要在任何 implementation memory 文件中写入 secrets、raw token、未脱敏隐私数据或敏感日志。

## 自检测步骤

1. Lead Reviewer 先读取所有权威文档和 implementation memory。

2. Lead Reviewer 创建上述 reviewers，并为每个 reviewer 分配明确检查清单。

3. 各 reviewer 并行检查，产出结构化报告到 `docs/superpowers/implementation-memory/reviews/final-<role>.md`。

4. Lead Reviewer 汇总所有报告到 `docs/superpowers/implementation-memory/final-self-check.md`。

5. 先运行仓库状态检查：

   ```bash
   git status --short
   git diff --check
   ```

   查看是否有未提交或不相关改动。不要覆盖或回滚用户改动。

6. 做静态结构检查：

   - monorepo 包结构是否符合计划；
   - `packages/contracts` 是否是跨项目唯一共享契约来源；
   - 前端、后端、测试是否重复定义 API path、event kind、schema、状态枚举；
   - filesystem layout 是否与 `init/design.md` §8 一致；
   - TeamWorkItem 完成态是否统一使用 `completed`，没有新写入 `done`。

7. 做产品验收检查：

   - 对照 `init/requirement.md` §10.1 的 1-69 项逐条打勾；
   - 每一项必须给出证据：代码路径、测试路径、运行结果或明确风险；
   - 不能只写“已实现”，必须写证据。

8. 做架构一致性检查：

   - User / Thread / TaskList / Task / Plan / PlanRevision / ChangeRecord / ArtifactRecord；
   - SkillManifest / GuardDecision / ChannelConfig / ChannelBinding / CriticalNodePolicy；
   - Team / Teammate / TeamWorkItem / TeamMessage；
   - ThreadLoop 和 Executor 职责是否分离；
   - TaskList 是否是唯一权威任务集合；
   - 是否没有 durable TaskQueue；
   - 一个 Thread 是否最多一个 active task；
   - Draft task/plan 是否不会进入 TaskList；
   - retry 是否只自动处理 transient_error；
   - retry 是否不级联到 subagent / Agent Teams；
   - CriticalNodePolicy 是否每次 tool dispatch 都重新评估；
   - Agent Teams 是否寄生在父 task 内，不创建新 task/thread。

9. 做 API 检查：

   - 所有 plan 中冻结的 API route 是否实现；
   - owner-sensitive action 是否 owner-first 校验；
   - 403/409 是否写 `task_action_denied`；
   - critical node approve/reject 是否可用；
   - Team cancel / teammate approve / teammate reject 是否可用；
   - retry-history 是否分页并脱敏；
   - channel config 是否 write-only secret，读取只返回 `hasSecret`。

10. 做持久化与恢复检查：

    - atomic write / JSONL / transactions / locks 是否有测试；
    - startup recovery 是否覆盖 tmp、transactions、schema migration、TaskList repair、artifact consistency、locked jobs、stale retry lock、team recovery；
    - kill-9 retry recovery 是否有 E2E；
    - events.jsonl 归档和 team archive 是否实现；
    - webhook dedupe TTL、job dedupe cleanup、transaction log retention 是否实现。

11. 做 Agent Teams 检查：

    - `team` 工具是否实现；
    - `publish_work / claim_work / release_claim / complete_work / fail_work / post_message / read_messages / finish_team` 是否实现；
    - claim 是否原子 rename；
    - reclaim_scanner 是否与 retry scheduler 隔离；
    - teammate 是否不能调用 team / finish_team；
    - teammate 是否可一层 subagent，但不能 nested team；
    - parent cancel / pause / plan_update 是否级联 team；
    - Team SSE events、Team panel API、Team metrics、TeamOrchestration eval 是否完整。

12. 做安全检查：

    - secrets / bearer token / Feishu token / API key 是否不会明文写 disk/log；
    - transcript / events / team messages / work item / summary / failure reason 是否走 sanitize；
    - path traversal 是否被阻止；
    - bash 工具是否限制工作目录；
    - Feishu webhook signature 是否校验；
    - external IO 是否可通过 CriticalNodePolicy 拦截；
    - high risk skill 是否默认审批。

13. 对所有 Critical / Important 问题创建修复任务。

14. 修复后由对应 reviewer 复验。所有 Critical / Important 清零后，才允许进入完整验证。

15. 运行完整验证命令：

    ```bash
    pnpm install
    pnpm lint
    pnpm test
    pnpm test:evals
    pnpm test:e2e
    pnpm build
    pnpm verify
    ```

16. 如果任何命令失败：

    - 不要跳过；
    - 记录失败到 `final-self-check.md`；
    - 定位根因；
    - 修复；
    - 重新运行失败命令；
    - 最后重新运行 `pnpm verify`。

17. Minor 问题：

    - 如果低风险且不影响验收，可以记录到 `open-risks.md`；
    - 但必须说明为什么不阻塞发布。

## 最终输出要求

最终回复中必须给出：

1. 自检测总体结论
2. `pnpm verify` 最终结果
3. 1-69 项 acceptance checklist 是否全部通过
4. 修复了哪些问题
5. 仍保留的 Minor 风险，如果有
6. 关键证据文件：
   - `docs/superpowers/implementation-memory/final-self-check.md`
   - 相关 review 文件
   - eval results
   - E2E results
   - dashboard/runbook 路径

重要：不要只做表面检查。你必须以“准备上线前验收”的标准自检。没有 fresh verification output，不要声称通过。
