import { describe, expect, it } from "vitest";
import { createEventQueue } from "../event-queue.js";

describe("EventQueue", () => {
  it("delivers items in FIFO order", async () => {
    const q = createEventQueue<number>();
    q.push(1);
    q.push(2);
    expect(await q.shift()).toBe(1);
    expect(await q.shift()).toBe(2);
  });

  it("shift waits when empty and resolves on push", async () => {
    const q = createEventQueue<string>();
    const p = q.shift();
    setTimeout(() => q.push("x"), 5);
    expect(await p).toBe("x");
  });

  it("close rejects pending shifts", async () => {
    const q = createEventQueue<number>();
    const p = q.shift();
    q.close();
    await expect(p).rejects.toThrow(/closed/);
  });
});
