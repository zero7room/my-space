// packages/bot-runtime/scripts/gen-message-guard-samples.ts
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

type Sample = {
  id: string;
  description: string;
  input: {
    source: string;
    bound: boolean;
    mentionsBot: boolean;
    replyToBotMessage: boolean;
    slashCommand: string | null;
    threadStatus: string;
    messageText: string;
  };
  expected: {
    intent: string;
    shortCircuited: boolean;
  };
};

const POOLS: Record<string, string[]> = {
  chat: [
    "你好",
    "Hello",
    "今天天气怎么样？",
    "How are you doing today?",
    "Are you online?",
    "下班了吗？",
    "I had lunch already",
    "Just checking in",
    "好久不见",
    "Did you watch the game last night?",
    "What's up",
    "Nothing much, just chatting",
    "早上好！",
    "晚上好，最近怎么样",
    "聊聊天吧",
    "Good morning!",
    "Have you eaten yet?",
    "今天吃了什么好吃的",
    "Random thought: the sky is blue",
    "Hey there, hope you're well",
    "周末过得怎么样",
    "Long time no chat",
    "在吗？随便聊聊",
    "What are your thoughts on AI?",
    "今天有点累",
    "Just saying hi",
    "我在摸鱼",
    "Tell me a joke",
    "你喜欢看什么电影",
    "Feeling bored today",
    "下午好呀",
    "你有没有推荐的书",
    "It's been a quiet day",
    "在公司加班呢",
    "I'm just killing time",
    "聊个天呗",
    "今天心情不太好",
    "Good evening!",
    "工作忙吗",
    "随便聊聊吧",
    "Hola! Como estas?",
    "今天堵车好严重",
    "有没有好看的剧推荐",
    "I'm having coffee right now",
    "最近在追什么剧",
    "Any plans for the weekend?",
    "今天下雨了",
    "Just wanted to say hello",
    "你最近在忙什么",
    "Chill day today",
  ],
  new_task: [
    "请帮我写一个 Python 脚本来抓取天气数据",
    "I need you to draft a meeting agenda for Friday",
    "Can you help me build a CRUD API for users?",
    "帮我整理这份会议纪要",
    "Please research the latest pricing for AWS RDS",
    "分析这份销售数据，找出趋势",
    "Build a small web app that lets users upload images",
    "帮我准备一份产品发布稿",
    "I want you to refactor this Go module",
    "Generate a SQL migration for adding a created_at column",
    "Write a regex to validate Chinese phone numbers",
    "请做一份竞品对比",
    "帮我写一份用户调研报告",
    "Create a GitHub Actions workflow for CI/CD",
    "I need a shell script to backup the database nightly",
    "请帮我起草一封给客户的道歉信",
    "Write unit tests for the auth module",
    "帮我做一个 Excel 数据透视表教程",
    "Summarize this 50-page PDF for me",
    "设计一个简单的消息队列系统",
    "I need you to create a Dockerfile for this Node.js app",
    "请帮我写一个爬虫，抓取京东商品价格",
    "Can you build a REST client in TypeScript?",
    "帮我写一个定时任务，每天早上 9 点发邮件",
    "I want a landing page for my SaaS product",
    "请帮我整理产品需求文档",
    "Draft an email to the team about the Q3 roadmap",
    "Write a load testing script using k6",
    "帮我分析这段代码有没有安全漏洞",
    "Create a data visualization dashboard using D3.js",
    "我需要你帮我写一份工作总结",
    "Help me write a Python script that scrapes weather data",
    "请帮我搭建一个本地的 Redis 集群",
    "Build a CLI tool for managing environment variables",
    "帮我写个 Slack Bot",
    "I need a script to convert CSV to JSON",
    "请帮我做一个 AB 测试方案",
    "Implement rate limiting in the API gateway",
    "帮我整理一下最近两周的 sprint 回顾",
    "Write a technical design doc for the new auth service",
    "请帮我拟一份招聘 JD",
    "Set up monitoring alerts for the production database",
    "帮我写一个自动化测试脚本",
    "Create a Notion template for weekly planning",
    "分析我们的用户留存数据",
    "帮我翻译这份合同成英文",
    "I need a script that watches a folder and syncs files to S3",
    "请帮我写一份技术方案，评估引入 Kafka 的可行性",
    "Build a minimal OAuth2 server",
    "帮我整理这次用户访谈的要点",
  ],
  task_update: [
    "把刚才那个任务的截止日改到下周",
    "Change the task title to 'urgent fix'",
    "Update the description: also include error handling",
    "把任务优先级调高",
    "Add a note that this is for the Q3 demo",
    "Bump the budget to 100k tokens",
    "Add deliverable: a slide deck",
    "改一下任务标题，叫'紧急修复'",
    "Mark this task as needing legal review",
    "Set the owner to Alice",
    "Add a tag: customer-facing",
    "Extend the deadline by 2 days",
    "把这个任务的描述补充一下，加上数据库迁移的步骤",
    "Remove the deliverable about the PDF report",
    "Update the task: the API should also support GraphQL",
    "把任务分配给 Bob",
    "Change priority to critical",
    "Add a note: blocked by legal sign-off",
    "这个任务的预算改成 50 小时",
    "Update: the deadline is now end of month",
  ],
  plan_update: [
    "Skip step 2",
    "在第一步前面加一步：先备份数据库",
    "Reorder: do step 3 before step 2",
    "Replace step 4 with: write integration tests",
    "把计划里的'部署到生产'去掉",
    "Add a step: run security review",
    "Combine steps 2 and 3 into one",
    "请把'写文档'步骤拆成两步",
    "Insert a new step after step 1: notify stakeholders",
    "Remove the last step from the plan",
    "把第二步改成：先做单元测试再做集成测试",
    "Add step 0: set up the development environment",
    "Swap the order of steps 4 and 5",
    "计划的最后加一步：做用户验收测试",
    "Delete step 3 entirely",
  ],
  confirm_task: [
    "好的开始吧",
    "Yes, please proceed",
    "OK confirmed",
    "/confirm",
    "确认",
    "go ahead",
    "Looks good, start",
    "Let's do it",
    "批准",
    "Approved",
    "Yes, this is what I want",
    "请执行",
    "没问题，开始吧",
    "Confirm and execute",
    "All good, proceed",
  ],
  confirm_plan: [
    "Plan looks good, go ahead",
    "计划没问题，执行",
    "OK approve plan",
    "Yes use that plan",
    "Plan approved",
    "这个计划可以",
    "OK with the plan",
    "/confirm-plan",
    "计划通过了，照这个做",
    "Looks good to me, follow the plan",
    "These steps look right, proceed",
    "批准这个方案",
  ],
  progress_query: [
    "What's the status?",
    "进度怎么样了？",
    "How far along are you?",
    "Any updates?",
    "Are you done yet?",
    "What step are you on?",
    "Show me the current progress",
    "Where are we at?",
    "请汇报进度",
    "What's the latest?",
    "任务完成了多少？",
    "How much longer will this take?",
    "Give me a status update",
    "还需要多久？",
    "What have you done so far?",
  ],
  cancel_task: [
    "Cancel this task",
    "/cancel",
    "停止执行",
    "Stop the task please",
    "Abort",
    "取消",
    "Don't do this anymore",
    "Forget about that",
    "Kill the task",
    "停了吧",
    "I changed my mind, cancel it please",
    "Never mind, let's drop this",
  ],
  irrelevant: [
    "看看我家猫的照片",
    "Random thought: I'm hungry",
    "lol",
    "...",
    "🤔",
    "ping",
    "Test message",
    "asdfasdf",
    "Just spam, ignore",
    "Hello world",
    "1234567890",
    "foo bar baz",
    "这条消息没有任何意义",
    "ignore this",
    "xyzzy",
  ],
};

const COUNTS: Record<string, number> = {
  chat: 50,
  new_task: 50,
  task_update: 20,
  plan_update: 15,
  confirm_task: 15,
  confirm_plan: 10,
  progress_query: 15,
  cancel_task: 10,
  irrelevant: 15,
};

// Sources for group/bound variation
const GROUP_SOURCES = ["lark_group"];

const samples: Sample[] = [];
let idx = 1;

for (const [intent, count] of Object.entries(COUNTS)) {
  const pool = POOLS[intent] ?? [];
  for (let i = 0; i < count; i++) {
    const phrasing = pool[i % pool.length] ?? `${intent} sample ${i}`;

    // Slash command logic: only when the phrasing is explicitly a slash command
    const isConfirmSlash = intent === "confirm_task" && phrasing === "/confirm";
    const isCancelSlash = intent === "cancel_task" && phrasing === "/cancel";

    // For confirm_task: alternate between slash and non-slash roughly half-and-half
    // For cancel_task: same
    let slashCommand: string | null = null;
    if (intent === "confirm_task" && i % 2 === 0) {
      slashCommand = "confirm";
    } else if (intent === "cancel_task" && i % 2 === 0) {
      slashCommand = "cancel";
    }

    // Only set shortCircuited when there's actually a slash command
    const shortCircuited = slashCommand !== null;

    // threadStatus variation for progress_query
    const threadStatus = intent === "progress_query" && i % 2 === 0 ? "working" : "chatting";

    // For new_task and task_update, add a few lark_group + bound=true + mentionsBot=true samples
    const useGroupContext = (intent === "new_task" || intent === "task_update") && i % 5 === 4;
    const source = useGroupContext ? (GROUP_SOURCES[0] ?? "lark_group") : "lark_private";
    const bound = useGroupContext;
    const mentionsBot = useGroupContext;

    // Use the actual slash phrasing as messageText when slash command is set but phrasing isn't /...
    // For even-indexed confirm/cancel, use meaningful non-slash text
    const messageText =
      slashCommand !== null && !phrasing.startsWith("/")
        ? phrasing // keep real phrasing, the slashCommand field signals the short-circuit
        : phrasing;

    samples.push({
      id: `mg_${String(idx).padStart(3, "0")}`,
      description: `${intent}: ${phrasing}`,
      input: {
        source,
        bound,
        mentionsBot,
        replyToBotMessage: false,
        slashCommand,
        threadStatus,
        messageText,
      },
      expected: {
        intent,
        shortCircuited,
      },
    });
    idx += 1;
  }
}

const __dirname = new URL(".", import.meta.url).pathname;
const outFile = path.join(__dirname, "..", "tests", "evals", "samples", "message-guard.jsonl");
await mkdir(path.dirname(outFile), { recursive: true });
const lines = samples.map((s) => JSON.stringify(s)).join("\n");
await writeFile(outFile, `${lines}\n`);
console.log(`wrote ${samples.length} samples to ${outFile}`);
