import { describe, expect, it } from "vitest";
import { parseGuardianCommand } from "../command-parser.js";

describe("parseGuardianCommand", () => {
  it("parses /bind <thread-id>", () => {
    expect(parseGuardianCommand("/bind th_abc")).toEqual({
      kind: "bind",
      threadId: "th_abc",
    });
  });

  it("parses /bind without args returns help variant", () => {
    expect(parseGuardianCommand("/bind")).toEqual({ kind: "bind", threadId: null });
  });

  it("parses /unbind", () => {
    expect(parseGuardianCommand("/unbind")).toEqual({ kind: "unbind" });
  });

  it("parses /list", () => {
    expect(parseGuardianCommand("/list")).toEqual({ kind: "list" });
  });

  it("parses /help", () => {
    expect(parseGuardianCommand("/help")).toEqual({ kind: "help" });
  });

  it("returns unknown for free-form text", () => {
    expect(parseGuardianCommand("hello")).toEqual({ kind: "unknown" });
  });

  it("ignores leading whitespace and capitalization", () => {
    expect(parseGuardianCommand("  /HELP  ")).toEqual({ kind: "help" });
  });
});
