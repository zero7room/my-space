import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readJson, writeJson } from "../json-file.js";

describe("json-file", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "json-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("writeJson then readJson roundtrips", async () => {
    const file = path.join(dir, "a.json");
    await writeJson(file, { hello: "world" });
    expect(await readJson<{ hello: string }>(file)).toEqual({ hello: "world" });
  });

  it("readJson on missing file returns null", async () => {
    expect(await readJson(path.join(dir, "missing.json"))).toBeNull();
  });

  it("writeJson is atomic (writes via temp file)", async () => {
    const file = path.join(dir, "atomic.json");
    await writeJson(file, { v: 1 });
    const onDisk = await readFile(file, "utf8");
    expect(JSON.parse(onDisk)).toEqual({ v: 1 });
  });

  it("writeJson creates parent directory", async () => {
    const file = path.join(dir, "deep/nested/dir/x.json");
    await writeJson(file, { ok: true });
    expect(await readJson<{ ok: boolean }>(file)).toEqual({ ok: true });
  });
});
