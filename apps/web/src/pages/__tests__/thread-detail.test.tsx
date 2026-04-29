import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AppContextProvider } from "../../app-context.js";
import { ThreadDetail } from "../thread-detail.js";

vi.mock("../../api/client.js", () => ({
  createApiClient: () => ({
    getThread: async () => ({ id: "th_1", title: "Project", status: "chatting" }),
    getTasks: async () => [{ id: "tk_1", title: "Task A", status: "running" }],
    getTranscript: async () => [],
    getPlan: async () => null,
    getArtifacts: async () => [],
  }),
}));

vi.mock("../../hooks/use-event-stream.js", () => ({
  useEventStream: () => ({ events: [], status: "open" }),
}));

describe("ThreadDetail", () => {
  it("renders three panels with thread data", async () => {
    render(
      <MemoryRouter initialEntries={["/threads/th_1"]}>
        <AppContextProvider>
          <Routes>
            <Route path="/threads/:id" element={<ThreadDetail />} />
          </Routes>
        </AppContextProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText("Project")).toBeInTheDocument());
    expect(screen.getByText(/Task A/)).toBeInTheDocument();
  });
});
