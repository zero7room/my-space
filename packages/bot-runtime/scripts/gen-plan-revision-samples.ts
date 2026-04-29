// packages/bot-runtime/scripts/gen-plan-revision-samples.ts
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

type Sample = {
  id: string;
  description: string;
  input: {
    currentPlanObjective: string;
    currentPlanSteps: string[];
    userMessage: string;
    taskStatus: string;
  };
  expected: {
    shouldRevise: boolean;
  };
};

const PLANS = [
  { objective: "build feature X", steps: ["draft schema", "implement endpoints", "write tests"] },
  {
    objective: "research Stripe alternatives",
    steps: ["list options", "compare pricing", "summarize"],
  },
  { objective: "migrate users table", steps: ["backup", "alter table", "verify"] },
  { objective: "set up CI pipeline", steps: ["pick runner", "write yaml", "test on PR"] },
  {
    objective: "draft Q3 sales report",
    steps: ["pull data", "analyze trends", "write narrative"],
  },
  {
    objective: "refactor auth service",
    steps: ["audit current code", "extract interfaces", "update tests"],
  },
  {
    objective: "deploy new API version",
    steps: ["build image", "run smoke tests", "push to registry", "update ingress"],
  },
];

const POOLS: Record<string, { count: number; phrasings: string[]; shouldRevise: boolean }> = {
  add_step: {
    count: 8,
    shouldRevise: true,
    phrasings: [
      "再加一步：先备份数据库",
      "Insert a step before the last: write integration tests",
      "Add a step at the end: deploy to staging",
      "新增一步：让法务审核一下",
      "Please add a verification step after step 2",
      "Also include a step to write release notes",
      "在最后加上：通知 oncall",
      "Add: schedule a post-deploy review",
      "Can you add a rollback step just in case?",
      "加一步：做用户验收测试",
    ],
  },
  remove_step: {
    count: 5,
    shouldRevise: true,
    phrasings: [
      "Skip step 2",
      "去掉部署到生产那一步",
      "Drop the QA step — we'll do it in next iteration",
      "Remove step 3, we don't need it",
      "把'写文档'去掉",
      "Cut the load testing step, we're short on time",
    ],
  },
  reorder: {
    count: 4,
    shouldRevise: true,
    phrasings: [
      "Reorder: do step 3 before step 2",
      "把测试放到部署前面",
      "Move the legal review to step 1",
      "Run validation before the migration, not after",
      "Swap steps 1 and 2",
    ],
  },
  change_objective: {
    count: 4,
    shouldRevise: true,
    phrasings: [
      "Actually let's focus on Stripe specifically, not all payment providers",
      "改一下目标：做用户管理而不是订单管理",
      "Change scope: just the iOS app, not Android too",
      "Adjust the objective — we just need a prototype, not production-ready code",
      "新目标是做一个 MVP，不用考虑扩展性",
    ],
  },
  no_revision: {
    count: 9,
    shouldRevise: false,
    phrasings: [
      "How's it going so far?",
      "进度怎么样了？",
      "Just checking in",
      "Are you still working?",
      "Let me know when step 2 is done",
      "你好",
      "OK that sounds right, keep going",
      "Looks good so far",
      "Continue",
      "Any blockers?",
      "快做完了吗",
    ],
  },
};

const samples: Sample[] = [];
let idx = 1;
for (const [scenario, def] of Object.entries(POOLS)) {
  for (let i = 0; i < def.count; i++) {
    const phrasing = def.phrasings[i % def.phrasings.length] ?? `${scenario} sample ${i}`;
    const plan = PLANS[idx % PLANS.length] ?? PLANS[0];
    const planObjective = plan?.objective ?? "build feature X";
    const planSteps = plan?.steps ?? ["step 1", "step 2", "step 3"];
    samples.push({
      id: `pr_${String(idx).padStart(3, "0")}`,
      description: `${scenario}: ${phrasing}`,
      input: {
        currentPlanObjective: planObjective,
        currentPlanSteps: planSteps,
        userMessage: phrasing,
        taskStatus: "running",
      },
      expected: {
        shouldRevise: def.shouldRevise,
      },
    });
    idx += 1;
  }
}

const __dirname = new URL(".", import.meta.url).pathname;
const outFile = path.join(__dirname, "..", "tests", "evals", "samples", "plan-revision.jsonl");
await mkdir(path.dirname(outFile), { recursive: true });
const lines = samples.map((s) => JSON.stringify(s)).join("\n");
await writeFile(outFile, `${lines}\n`);
console.log(`wrote ${samples.length} samples to ${outFile}`);
