import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendJsonl, readJsonl, tailJsonl } from "../jsonl.js";

describe("jsonl", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "jsonl-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("appendJsonl creates file and appends each call as one line", async () => {
    const file = path.join(dir, "log.jsonl");
    await appendJsonl(file, { a: 1 });
    await appendJsonl(file, { b: 2 });
    const all = await readJsonl<{ a?: number; b?: number }>(file);
    expect(all).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("readJsonl on missing file returns []", async () => {
    expect(await readJsonl(path.join(dir, "nope.jsonl"))).toEqual([]);
  });

  it("tailJsonl returns last N entries", async () => {
    const file = path.join(dir, "log.jsonl");
    for (let i = 0; i < 5; i++) await appendJsonl(file, { i });
    expect(await tailJsonl<{ i: number }>(file, 2)).toEqual([{ i: 3 }, { i: 4 }]);
  });

  it("appendJsonl handles object containing newlines safely (no embedded raw)", async () => {
    const file = path.join(dir, "log.jsonl");
    await appendJsonl(file, { msg: "line1\nline2" });
    const [first] = await readJsonl<{ msg: string }>(file);
    expect(first?.msg).toBe("line1\nline2");
  });

  it("readJsonl skips blank lines", async () => {
    const file = path.join(dir, "log.jsonl");
    await appendJsonl(file, { a: 1 });
    const fs = await import("node:fs/promises");
    await fs.appendFile(file, "\n\n");
    await appendJsonl(file, { a: 2 });
    expect(await readJsonl<{ a: number }>(file)).toEqual([{ a: 1 }, { a: 2 }]);
  });
});
