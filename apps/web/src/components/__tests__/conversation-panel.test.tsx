import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppContextProvider } from "../../app-context.js";
import { ConversationPanel } from "../conversation-panel.js";

const postMessage = vi.fn().mockResolvedValue({ kind: "noop" });
const getTranscriptCalls: number[] = [];

vi.mock("../../api/client.js", () => ({
  createApiClient: () => ({
    getTranscript: async () => {
      getTranscriptCalls.push(1);
      return [
        { messageId: "m1", kind: "user_message", text: "hello", at: "2026-04-29T01:00:00Z" },
        {
          messageId: "m2",
          kind: "assistant_message",
          text: "hi there",
          at: "2026-04-29T01:01:00Z",
        },
      ];
    },
    postMessage,
  }),
}));

describe("ConversationPanel", () => {
  it("renders transcript and posts a new message", async () => {
    render(
      <AppContextProvider>
        <ConversationPanel threadId="th_1" />
      </AppContextProvider>,
    );
    await waitFor(() => expect(screen.getByText(/hello/)).toBeInTheDocument());
    expect(screen.getByText(/hi there/)).toBeInTheDocument();

    const textarea = screen.getByPlaceholderText(/message/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "new msg" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith(
        "th_1",
        expect.objectContaining({ text: "new msg" }),
      ),
    );
  });
});
