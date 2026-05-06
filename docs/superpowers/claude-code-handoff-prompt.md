# Claude Code Handoff Prompt

请从 0 到 1 完成本仓库的 AI Workflow System V1 实现。该实现应按 TypeScript monorepo / 多项目管理方式落地，而不是单应用工程：包含 `apps/bot-runtime`、`apps/web`、`packages/contracts`、`packages/fs-store`、`packages/test-fixtures`、`tests/e2e`、`tests/evals`、`ops`、`tooling`、`docs` 等项目/包。

你必须先阅读并遵守以下文档，按它们作为权威输入执行：

1. `init/requirement.md`
2. `init/design.md`
3. `docs/superpowers/specs/2026-05-06-ai-workflow-system-v1-design.md`
4. `docs/superpowers/plans/2026-05-06-ai-workflow-system-v1.md`

## 参考项目说明

`reference/` 下的项目仅作为架构与实现模式参考，不是本次直接改造对象，也不能覆盖 canonical docs 的要求。

重点参考：

- `reference/xuedian/`：参考 bot-runtime 的文件系统持久化、Channel/Feishu、binding、chat-claims、outbound job、Guardian 思路。
- `reference/deer-flow/`：参考客户端产品形态、thread/workspace/artifact、middleware pipeline、SSE/可视化、agent runtime 组织方式。
- `reference/claude-code-analysis/`：如可读，参考 Claude Code agent loop、tool protocol、subagent、skills、context/session/message guard 等模式。

使用规则：

1. 先读 `init/requirement.md` 和 `init/design.md`，它们是唯一权威规格。
2. 再读 reference 中相关文档/代码，提取模式，不要照搬产品语义。
3. 如果 reference 与 canonical docs 冲突，以 `init/requirement.md` / `init/design.md` / superpowers spec / implementation plan 为准。
4. 如果 reference 源码不可读，不要阻塞实现，按 canonical docs 和 implementation plan 继续。

## 执行方式要求

由于计划非常复杂，你应当组建 AgentsTeam，由多个 SubAgent / Teammate 协作完成各阶段任务，以避免主上下文频繁超出长度被压缩。

你需要从 Phase 0 开始，严格按 `docs/superpowers/plans/2026-05-06-ai-workflow-system-v1.md` 逐阶段执行，直到完成最终验收。中途不要停下来问我实现细节，除非遇到无法通过合理工程判断解决的硬阻塞。对于普通实现取舍，请遵循 canonical docs、superpowers spec 和 implementation plan 自行决策。

## 上下文持久化要求

实现过程中允许并且应该使用本地文件系统作为持久化工作记忆，位置为：

`docs/superpowers/implementation-memory/`

你需要维护：

- `phase-status.md`：记录当前阶段、完成项、验证命令、失败项、下一阶段入口条件
- `decisions.md`：记录重要架构/实现决策
- `open-risks.md`：记录未关闭风险
- `agent-handoffs/`：每个 agent/phase 的交接记录
- `reviews/`：每阶段批判性审查结果

这些文件用于防止上下文压缩导致丢失状态。不要在其中写入 secrets、raw token、未脱敏隐私数据或敏感日志。

## 团队建议

- Lead / Integrator：负责阶段推进、接口冻结、合并、最终验收。
- Runtime Core Agent：负责 contracts、schemas、state machines、fs-store、runtime、ThreadLoop、Executor、retry、recovery、tools、skills、CriticalNodePolicy、Agent Teams runtime。
- API / Channel Agent：负责 Fastify API、SSE、auth、Feishu、ChannelProvider、Guardian、outbound jobs、notify throttling。
- Frontend Agent：负责 Next.js 客户端、chat/thread/task/plan/artifact/channel/team UI。
- Eval / Test Agent：负责 unit/integration/E2E/eval/CI/fake-clock/kill-9 测试。
- Ops / Security Agent：负责 sanitize、metrics、OTel、Grafana、runbooks、Docker、security review。
- Reviewer Agent：每个阶段完成后从批判视角审查实现。

## 多项目协作要求

所有跨项目接口必须先落在 `packages/contracts`，其他项目只能依赖 contracts，不允许前端、后端、测试各自复制 API path、event kind、schema 或状态枚举。

## 阶段要求

每个 phase 完成后必须：

1. 更新 `docs/superpowers/implementation-memory/phase-status.md`
2. 写对应 handoff
3. 进行一轮阶段代码批判性 review
4. 修复 Critical / Important 问题后再进入下一阶段
5. 尽可能运行该阶段相关验证命令
6. 只在验证通过后做 checkpoint commit；如果当前 git tree 有与本任务无关的用户改动，不要覆盖或回滚

## 最终完成前必须

1. 进行产品视角 Review，对照 `init/requirement.md` §10.1 的 1-69 项验收标准逐项检查
2. 进行安全 Review
3. 运行完整验证：
   - `pnpm install`
   - `pnpm lint`
   - `pnpm test`
   - `pnpm test:evals`
   - `pnpm test:e2e`
   - `pnpm build`
   - `pnpm verify`
4. 修复所有失败项
5. 最终 `pnpm verify` 必须通过
6. 在最终回复中给出：
   - 完成摘要
   - 关键文件/模块
   - 验证命令及结果
   - acceptance checklist 结果
   - 未完成项或风险，如果有

## 重要约束

- 不要实现独立 durable TaskQueue，TaskList 是唯一权威任务集合。
- 一个 Thread 同时最多一个 active task。
- Draft task/plan 未确认前不能进入 TaskList。
- 所有 owner-sensitive action 必须 owner-first 校验。
- retry 只对 transient_error 自动触发。
- retry 不级联到 subagent 或 Agent Teams。
- CriticalNodePolicy 每次 tool dispatch 都要重新评估。
- Team 寄生在父 task 内，不创建新 task/thread。
- Teammate 不能再派 Team。
- TeamWorkItem 完成态必须使用 `completed`，不要使用 `done`。
- 不要把 secrets 或未脱敏 PII 写入磁盘。
- 如果 implementation memory 与 `init/requirement.md` / `init/design.md` / superpowers spec / implementation plan 冲突，以 canonical docs 和 plan 为准。

请现在开始，从 Phase 0 执行到最终验收，中途不要停下来等待我的确认。
