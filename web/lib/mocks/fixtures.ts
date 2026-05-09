import type { PingResponse } from "@/lib/api/client";

export const mockPingResponse: PingResponse = {
  ok: true,
  message: "pong",
};

export const workbenchFixtures = {
  briefing: [
    {
      label: "今日要点",
      value: "等待日终扫描",
      detail: "M1 数据层接入后替换为市场、板块和事件摘要。",
    },
    {
      label: "关注画像",
      value: "0 个对象",
      detail: "后续承接板块、个股和跨市场事件关注列表。",
    },
    {
      label: "持续观察",
      value: "0 条提醒",
      detail: "M4 提醒闸门上线后展示待跟进信号。",
    },
  ],
  watchlist: [
    { subject: "光模块", status: "等待数据源 Spike", trend: "M1 前置" },
    { subject: "英伟达传导链", status: "等待手工边录入", trend: "M1-T15" },
    { subject: "策略提醒", status: "等待 DSL 引擎", trend: "M4" },
  ],
};
