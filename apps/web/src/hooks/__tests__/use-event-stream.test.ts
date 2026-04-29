import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useEventStream } from "../use-event-stream.js";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  onopen: ((e: Event) => void) | null = null;
  closed = false;
  private listeners: Record<string, Array<(e: Event) => void>> = {};
  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  close() {
    this.closed = true;
  }
  addEventListener(name: string, fn: (e: Event) => void) {
    if (!this.listeners[name]) {
      this.listeners[name] = [];
    }
    this.listeners[name]!.push(fn);
  }
  removeEventListener(name: string, fn: (e: Event) => void) {
    const arr = this.listeners[name];
    if (!arr) return;
    const i = arr.indexOf(fn);
    if (i >= 0) arr.splice(i, 1);
  }
  emit(data: unknown) {
    const ev = { data: JSON.stringify(data) } as MessageEvent;
    if (this.listeners.message) {
      for (const l of this.listeners.message) {
        l(ev);
      }
    }
  }
}

afterEach(() => {
  FakeEventSource.instances = [];
  vi.unstubAllGlobals();
});

describe("useEventStream", () => {
  it("subscribes to URL and accumulates events", async () => {
    vi.stubGlobal("EventSource", FakeEventSource);
    const { result } = renderHook(() =>
      useEventStream<{ id: string; kind: string }>({ url: "/api/threads/th_1/events" }),
    );
    expect(FakeEventSource.instances).toHaveLength(1);

    await act(async () => {
      FakeEventSource.instances[0]!.emit({ id: "ev_1", kind: "executor_started" });
    });

    expect(result.current.events).toHaveLength(1);
    expect(result.current.events[0]?.id).toBe("ev_1");
  });

  it("closes EventSource on unmount", () => {
    vi.stubGlobal("EventSource", FakeEventSource);
    const { unmount } = renderHook(() =>
      useEventStream<{ id: string; kind: string }>({ url: "/api/threads/th_1/events" }),
    );
    unmount();
    expect(FakeEventSource.instances[0]!.closed).toBe(true);
  });
});
