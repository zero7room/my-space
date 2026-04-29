// packages/bot-runtime/scripts/gen-task-confirmation-samples.ts
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

type Sample = {
  id: string;
  description: string;
  input: {
    draftTaskTitle: string;
    draftTaskDescription: string;
    userMessage: string;
  };
  expected: {
    transition: string;
  };
};

const TASK_TITLES = [
  "Build auth module",
  "Refactor payments service",
  "Write user onboarding email",
  "Generate quarterly sales report",
  "Set up Kubernetes cluster",
  "Translate user manual to Japanese",
  "Design new dashboard UI",
  "Migrate database to PostgreSQL",
  "Write API documentation",
  "Implement search feature",
  "Fix critical security vulnerability",
  "Create CI/CD pipeline",
];

const POOLS: Record<string, string[]> = {
  confirm_task: [
    "好的，开始吧",
    "Yes, please proceed",
    "OK confirmed",
    "/confirm",
    "确认开始",
    "go ahead",
    "Looks good, start",
    "Let's do it",
    "批准",
    "Approved",
    "Yes, this is what I want",
    "请执行",
    "OK 没问题",
    "Confirm",
    "Start working on it",
    "Approve",
    "Yes do it",
    "Sounds good — start",
    "Begin",
    "Confirmed",
    // extras to avoid excessive cycling
    "没问题，开始",
    "Confirm and execute",
    "All good, proceed",
    "Give it a go",
    "You have my approval",
  ],
  cancel_task: [
    "Cancel this task",
    "/cancel",
    "停止",
    "Don't do this anymore",
    "Forget about that",
    "Abort it",
    "取消任务",
    "Drop it",
    "Never mind",
    "Cancel",
    "I changed my mind, skip it",
    "我不想做这个了，取消吧",
  ],
  task_update: [
    "Change the title to 'urgent fix'",
    "Add: include error handling",
    "Bump priority to high",
    "Update description: focus on Stripe specifically",
    "Add deadline: this Friday",
    "Tag this as customer-facing",
    "Set owner to Alice",
    "把任务范围扩大到包含手机端",
    "改一下标题，叫'紧急'",
    "Extend the budget to 200k tokens",
    "Add a note: needs security review first",
    "把截止日期改到下周五",
    "Remove the PDF deliverable from the task",
    "Set priority to critical",
    "也要覆盖 iOS 平台，请更新描述",
  ],
  plan_update: [
    "Add a step: write integration tests first",
    "Skip step 2",
    "在第一步前加一步：先备份数据库",
    "Reorder: do step 3 before step 2",
    "Replace step 4 with: do code review",
    "Add a final step: notify stakeholders",
    "把最后一步改成先做 review 再部署",
    "Remove the deploy step entirely",
  ],
  chat: [
    "Just checking in",
    "Are you online?",
    "How's it going?",
    "Lunch break?",
    "Did you see the news today?",
    "今天天气不错",
    "你最近忙吗",
    "摸个鱼",
  ],
  irrelevant: ["🤔", "asdf", "...", "ping"],
};

const COUNTS: Record<string, number> = {
  confirm_task: 20,
  cancel_task: 8,
  task_update: 10,
  plan_update: 5,
  chat: 5,
  irrelevant: 2,
};

const samples: Sample[] = [];
let idx = 1;
for (const [transition, count] of Object.entries(COUNTS)) {
  const pool = POOLS[transition] ?? [];
  for (let i = 0; i < count; i++) {
    const userMessage = pool[i % pool.length] ?? `${transition} sample ${i}`;
    const taskIdx = (idx - 1) % TASK_TITLES.length;
    samples.push({
      id: `tc_${String(idx).padStart(3, "0")}`,
      description: `${transition}: ${userMessage}`,
      input: {
        draftTaskTitle: TASK_TITLES[taskIdx] ?? "Task",
        draftTaskDescription: `Description for ${TASK_TITLES[taskIdx] ?? "Task"}`,
        userMessage,
      },
      expected: { transition },
    });
    idx += 1;
  }
}

const __dirname = new URL(".", import.meta.url).pathname;
const outFile = path.join(__dirname, "..", "tests", "evals", "samples", "task-confirmation.jsonl");
await mkdir(path.dirname(outFile), { recursive: true });
const lines = samples.map((s) => JSON.stringify(s)).join("\n");
await writeFile(outFile, `${lines}\n`);
console.log(`wrote ${samples.length} samples to ${outFile}`);
