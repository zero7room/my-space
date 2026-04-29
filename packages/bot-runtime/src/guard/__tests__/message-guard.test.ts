import { describe, expect, it } from "vitest";
import { createStubLlmClient } from "../../llm/client.js";
import { createMessageGuard } from "../message-guard.js";

describe("MessageGuard", () => {
  it("short-circuits via rules without calling LLM", async () => {
    let llmCalled = false;
    const guard = createMessageGuard({
      llm: {
        async complete() {
          llmCalled = true;
          return { kind: "text", text: "" };
        },
      },
    });
    const out = await guard.classify({
      source: "lark_group",
      bound: true,
      mentionsBot: false,
      replyToBotMessage: false,
      slashCommand: null,
      threadStatus: "chatting",
      messageText: "casual chat",
      pendingTaskId: undefined,
      pendingPlanId: undefined,
    });
    expect(out.intent).toBe("irrelevant");
    expect(out.shortCircuited).toBe(true);
    expect(llmCalled).toBe(false);
  });

  it("calls LLM in private chat", async () => {
    const llm = createStubLlmClient(
      {},
      {
        kind: "json",
        data: { intent: "new_task", confidence: 0.9, reason: "stub" },
      },
    );
    const guard = createMessageGuard({ llm });
    const out = await guard.classify({
      source: "lark_private",
      bound: false,
      mentionsBot: false,
      replyToBotMessage: false,
      slashCommand: null,
      threadStatus: "chatting",
      messageText: "build me a thing",
      pendingTaskId: undefined,
      pendingPlanId: undefined,
    });
    expect(out.intent).toBe("new_task");
    expect(out.shortCircuited).toBe(false);
  });

  it("falls back when LLM throws", async () => {
    const llm = {
      async complete() {
        throw new Error("network down");
      },
    };
    const guard = createMessageGuard({ llm });
    const out = await guard.classify({
      source: "client",
      bound: false,
      mentionsBot: false,
      replyToBotMessage: false,
      slashCommand: "confirm",
      threadStatus: "waiting_confirmation",
      messageText: "/confirm",
      pendingTaskId: undefined,
      pendingPlanId: undefined,
    });
    expect(out.intent).toBe("confirm_task");
    expect(out.ruleHits).toContain("llm_degraded");
  });
});
