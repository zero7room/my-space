import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mocks must come before App import via vi.hoisted to keep references stable across react re-renders.
const { eventsRef, getTasksMock } = vi.hoisted(() => {
  const eventsRef = { current: [] as Array<{ id: string; kind: string }> };
  const getTasksMock = vi.fn();
  return { eventsRef, getTasksMock };
});

vi.mock("../api/client.js", () => ({
  createApiClient: () => ({
    getThreads: async () => [{ id: "th_1", title: "Project", status: "chatting" }],
    getThread: async () => ({ id: "th_1", title: "Project", status: "chatting" }),
    getTasks: getTasksMock,
    getTask: async () => ({
      id: "tk_1",
      threadId: "th_1",
      title: "Task A",
      description: "d",
      status: "draft",
    }),
    getPlan: async () => null,
    getArtifacts: async () => [],
    getTranscript: async () => [],
    postMessage: async () => ({ kind: "noop" }),
    confirmTask: async () => ({ kind: "noop" }),
    cancelTask: async () => ({ kind: "noop" }),
    getChannels: async () => [],
    putChannel: async () => ({}),
  }),
}));

vi.mock("../hooks/use-event-stream.js", () => ({
  useEventStream: () => ({ events: eventsRef.current, status: "open" }),
}));

import { App } from "../app.js";

beforeEach(() => {
  eventsRef.current = [];
  getTasksMock.mockReset();
  getTasksMock.mockResolvedValue([{ id: "tk_1", title: "Task A", status: "running" }]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("e2e smoke: thread detail with SSE refresh", () => {
  it("renders thread detail and refreshes tasks when SSE events arrive", async () => {
    const { rerender } = render(
      <MemoryRouter initialEntries={["/threads/th_1"]}>
        <App />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText("Project")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("Tasks")).toBeInTheDocument());
    const taskElements = screen.getAllByText(/Task A/);
    expect(taskElements.length).toBeGreaterThan(0);

    const initialCalls = getTasksMock.mock.calls.length;

    // simulate a new SSE event arriving — push to events array, rerender
    await act(async () => {
      eventsRef.current = [{ id: "ev_1", kind: "executor_started" }];
      rerender(
        <MemoryRouter initialEntries={["/threads/th_1"]}>
          <App />
        </MemoryRouter>,
      );
    });

    await waitFor(() => {
      expect(getTasksMock.mock.calls.length).toBeGreaterThan(initialCalls);
    });
  });
});
