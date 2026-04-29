import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppContextProvider } from "../../app-context.js";
import { TaskPlanPanel } from "../task-plan-panel.js";

const confirmTask = vi.fn().mockResolvedValue({ kind: "dispatched" });

vi.mock("../../api/client.js", () => ({
  createApiClient: () => ({
    getTask: async () => ({
      id: "tk_1",
      threadId: "th_1",
      title: "Build feature",
      description: "do x",
      status: "draft",
    }),
    getPlan: async () => ({
      id: "pl_1",
      objective: "ship feature",
      steps: [
        { id: "ps_1", title: "design", status: "pending" },
        { id: "ps_2", title: "implement", status: "pending" },
      ],
    }),
    confirmTask,
    cancelTask: vi.fn(),
  }),
}));

describe("TaskPlanPanel", () => {
  it("renders task and plan, calls confirmTask on Confirm click", async () => {
    render(
      <AppContextProvider>
        <TaskPlanPanel taskId="tk_1" threadId="th_1" />
      </AppContextProvider>,
    );
    await waitFor(() => expect(screen.getByText(/Build feature/)).toBeInTheDocument());
    expect(screen.getByText(/ship feature/)).toBeInTheDocument();
    expect(screen.getByText(/design/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^confirm$/i }));
    await waitFor(() =>
      expect(confirmTask).toHaveBeenCalledWith(
        "tk_1",
        expect.objectContaining({ threadId: "th_1" }),
      ),
    );
  });
});
