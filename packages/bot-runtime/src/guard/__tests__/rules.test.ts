import { describe, expect, it } from "vitest";
import { evaluateRules } from "../rules.js";

describe("evaluateRules", () => {
  it("bound group with no @bot/no reply → silence", () => {
    const r = evaluateRules({
      source: "lark_group",
      bound: true,
      mentionsBot: false,
      replyToBotMessage: false,
      slashCommand: null,
      threadStatus: "chatting",
    });
    expect(r.shortCircuit).toBe(true);
    expect(r.intent).toBe("irrelevant");
    expect(r.ruleHits).toContain("bound_group_silent");
  });

  it("unbound group → silence (waits for guardian flow)", () => {
    const r = evaluateRules({
      source: "lark_group",
      bound: false,
      mentionsBot: true,
      replyToBotMessage: false,
      slashCommand: null,
      threadStatus: "chatting",
    });
    expect(r.shortCircuit).toBe(true);
    expect(r.intent).toBe("irrelevant");
    expect(r.ruleHits).toContain("unbound_group_silent");
  });

  it("bound group with /confirm slash → confirm_task short-circuit", () => {
    const r = evaluateRules({
      source: "lark_group",
      bound: true,
      mentionsBot: false,
      replyToBotMessage: false,
      slashCommand: "confirm",
      threadStatus: "waiting_confirmation",
    });
    expect(r.shortCircuit).toBe(true);
    expect(r.intent).toBe("confirm_task");
  });

  it("private chat / client → defers to LLM (no short-circuit)", () => {
    const r = evaluateRules({
      source: "client",
      bound: false,
      mentionsBot: false,
      replyToBotMessage: false,
      slashCommand: null,
      threadStatus: "chatting",
    });
    expect(r.shortCircuit).toBe(false);
  });
});
