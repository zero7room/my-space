import { describe, expect, it } from "vitest";
import { fallbackClassify } from "../fallback.js";

describe("fallbackClassify (LLM unavailable)", () => {
  it("recognises explicit /confirm", () => {
    const out = fallbackClassify({
      messageText: "/confirm",
      slashCommand: "confirm",
    });
    expect(out.intent).toBe("confirm_task");
  });

  it("recognises explicit /cancel", () => {
    const out = fallbackClassify({
      messageText: "/cancel",
      slashCommand: "cancel",
    });
    expect(out.intent).toBe("cancel_task");
  });

  it("default falls through as chat with note", () => {
    const out = fallbackClassify({ messageText: "hi", slashCommand: null });
    expect(out.intent).toBe("chat");
    expect(out.reason).toMatch(/degraded/i);
  });
});
