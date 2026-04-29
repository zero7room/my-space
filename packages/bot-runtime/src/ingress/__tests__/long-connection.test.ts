import { describe, expect, it, vi } from "vitest";
import { createNoopLongConnection, runLongConnection } from "../long-connection.js";

describe("LongConnection", () => {
  it("runLongConnection invokes adapter.start exactly once and stops on close", async () => {
    const start = vi.fn().mockResolvedValue(undefined);
    const stop = vi.fn().mockResolvedValue(undefined);
    const handle = await runLongConnection({ start, stop });
    expect(start).toHaveBeenCalledTimes(1);
    await handle.close();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("createNoopLongConnection is a safe default", async () => {
    const noop = createNoopLongConnection();
    await expect(noop.start({} as never)).resolves.toBeUndefined();
    await expect(noop.stop()).resolves.toBeUndefined();
  });
});
