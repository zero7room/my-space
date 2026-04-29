import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AppContextProvider } from "../../app-context.js";
import { ThreadList } from "../thread-list.js";

vi.mock("../../api/client.js", () => ({
  createApiClient: () => ({
    getThreads: async () => [
      { id: "th_1", title: "Project A", status: "chatting" },
      { id: "th_2", title: "Project B", status: "working" },
    ],
  }),
}));

describe("ThreadList", () => {
  it("renders threads from API", async () => {
    render(
      <MemoryRouter>
        <AppContextProvider>
          <ThreadList />
        </AppContextProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText("Project A")).toBeInTheDocument());
    expect(screen.getByText("Project B")).toBeInTheDocument();
  });
});
