import { describe, expect, it } from "vitest";
import { createStubLlmClient } from "../../llm/client.js";
import { classifyIntentWithLlm } from "../llm-classifier.js";

describe("classifyIntentWithLlm", () => {
  it("parses canned JSON into IntentClassification", async () => {
    const llm = createStubLlmClient(
      {},
      {
        kind: "json",
        data: {
          intent: "new_task",
          confidence: 0.93,
          reason: "user asks for landing page",
        },
      },
    );
    const out = await classifyIntentWithLlm({
      llm,
      threadStatus: "chatting",
      pendingTaskId: undefined,
      pendingPlanId: undefined,
      messageText: "build me a landing page",
    });
    expect(out.intent).toBe("new_task");
    expect(out.confidence).toBeCloseTo(0.93);
  });

  it("falls back to chat with low confidence on parse failure", async () => {
    const llm = createStubLlmClient(
      {},
      { kind: "text", text: "I have no idea what you mean" },
    );
    const out = await classifyIntentWithLlm({
      llm,
      threadStatus: "chatting",
      pendingTaskId: undefined,
      pendingPlanId: undefined,
      messageText: "?",
    });
    expect(out.intent).toBe("chat");
    expect(out.confidence).toBeLessThan(0.5);
  });
});
