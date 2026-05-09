import { expect, test } from "@playwright/test";

test("home shows alerts and opens sector analysis", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "研究辅助工作台" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "工作流地图" })).toBeVisible();
  await expect(page.getByRole("link", { name: /策略工作台/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Skill 库/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "光模块综合分变动 +0.04" }).first()).toBeVisible();
  await page.getByRole("link", { name: /板块：光模块/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "光模块", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "龙头榜" })).toBeVisible();
});

test("market overview filters sectors and graph evidence is expandable", async ({ page }) => {
  await page.goto("/analysis/market");

  await expect(page.getByRole("heading", { name: "板块总览" })).toBeVisible();
  await page.getByRole("button", { name: "下跌" }).click();
  await expect(page.getByText(/当前显示/)).toBeVisible();
  await page.getByRole("link", { name: "创新药" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "创新药" })).toBeVisible();

  await page.goto("/analysis/event/EVT_NVDA_GUIDE");
  await page.getByText("英伟达 → GPU", { exact: true }).click();
  await expect(page.getByRole("link", { name: "news:NVDA-guidance" })).toBeVisible();
});

test("sector page expands leader evidence and opens stock page", async ({ page }) => {
  await page.goto("/analysis/sector/BK_CPO");

  await expect(page.getByRole("link", { name: "中际旭创" })).toBeVisible();
  await expect(page.getByLabel("五维评分雷达图")).toBeVisible();
  await page.getByRole("link", { name: "中际旭创" }).first().click();
  await expect(page.getByRole("heading", { name: "中际旭创" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "风险标签" })).toBeVisible();
});

test("unknown sector id shows an empty state instead of fixture content", async ({ page }) => {
  await page.goto("/analysis/sector/UNKNOWN_SECTOR");

  await expect(page.getByRole("heading", { name: "板块不存在" })).toBeVisible();
  await expect(page.getByText("UNKNOWN_SECTOR")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "光模块", exact: true })).toHaveCount(0);
});

test("cross-market event shows impact graph and artifact", async ({ page }) => {
  await page.goto("/analysis/event/EVT_NVDA_GUIDE");

  await expect(page.getByRole("heading", { name: "英伟达盘后指引下修 4%" })).toBeVisible();
  await expect(page.getByLabel("跨市场影响图")).toBeVisible();
  await page.goto("/artifacts/run_nvda_impact_20260508");
  await expect(page.getByRole("heading", { level: 1, name: "英伟达事件跨市场影响路径" })).toBeVisible();
  await expect(page.getByText("传导到 A 股算力链")).toBeVisible();
});

test("notification center opens chat thread from the bell", async ({ page }) => {
  await page.goto("/analysis/market");

  await page.getByRole("button", { name: "打开提醒" }).click();
  await expect(page.getByText("光模块综合分变动 +0.04")).toBeVisible();
  await page.getByRole("link", { name: /光模块综合分变动/ }).click();
  await expect(page.getByRole("heading", { name: "光模块龙头讨论" })).toBeVisible();
  await expect(page.getByText("tool-call trace")).toBeVisible();
});

test("chat streams a mock answer and saves thread as strategy", async ({ page }) => {
  await page.goto("/chat/thread_cpo");

  await page.getByPlaceholder("输入研究问题，或 /skill 龙头识别").fill("把这个监控固化成策略");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByText("正在流式生成回答")).toBeVisible();
  await expect(page.getByText("已读取当前 subject")).toBeVisible();
  await page.getByTestId(/^trace-assistant-/).locator("summary").click();
  await expect(page.getByTestId(/^trace-assistant-/).getByText("SSE mock: open")).toBeVisible();
  await page.getByRole("link", { name: "保存为策略" }).click();
  await expect(page.getByRole("heading", { name: "我的策略" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "从 Chat 保存为策略" })).toBeVisible();
  await expect(page.getByText("DSL 草稿", { exact: true })).toBeVisible();
});

test("cmd+k jumps to an artifact", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Cmd+K" }).click();
  await page.getByPlaceholder("搜索板块、个股、事件或 Artifact").fill("龙头评分");
  await page.getByRole("link", { name: /光模块龙头评分拆解/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "光模块龙头评分拆解" })).toBeVisible();
});
