import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppContextProvider } from "../../app-context.js";
import { ArtifactPanel } from "../artifact-panel.js";

const getArtifact = vi.fn().mockResolvedValue("# title\nbody");

vi.mock("../../api/client.js", () => ({
  createApiClient: () => ({
    getArtifacts: async () => [
      { name: "report.md", sizeBytes: 12, modifiedAt: "2026-04-29T01:00:00Z" },
      { name: "out.json", sizeBytes: 50, modifiedAt: "2026-04-29T01:01:00Z" },
    ],
    getArtifact,
  }),
}));

describe("ArtifactPanel", () => {
  it("lists artifacts and loads content on click", async () => {
    render(
      <AppContextProvider>
        <ArtifactPanel taskId="tk_1" threadId="th_1" />
      </AppContextProvider>,
    );
    await waitFor(() => expect(screen.getByText(/report.md/)).toBeInTheDocument());
    expect(screen.getByText(/out.json/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /report.md/i }));
    await waitFor(() => expect(getArtifact).toHaveBeenCalledWith("tk_1", "th_1", "report.md"));
    await waitFor(() => expect(screen.getByText(/# title/)).toBeInTheDocument());
  });
});
