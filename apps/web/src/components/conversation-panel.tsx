import { useEffect, useState } from "react";
import { useAppContext } from "../app-context.js";

type TranscriptEntry = {
  messageId: string;
  kind: string;
  text?: string;
  at: string;
  // accept anything else
  [key: string]: unknown;
};

function entryText(e: TranscriptEntry): string {
  if (typeof e.text === "string") return e.text;
  if (typeof e.content === "string") return e.content;
  return `[${e.kind}]`;
}

function entryAuthor(e: TranscriptEntry): string {
  if (e.kind === "user_message") return "user";
  if (e.kind === "assistant_message") return "assistant";
  return e.kind;
}

export function ConversationPanel({ threadId }: { threadId: string }) {
  const { client } = useAppContext();
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const lines = (await client.getTranscript(threadId)) as TranscriptEntry[];
        if (alive) setEntries(lines);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [client, threadId]);

  async function send() {
    if (!draft.trim()) return;
    try {
      await client.postMessage(threadId, { text: draft, fromUserId: "u_client" });
      setDraft("");
      const lines = (await client.getTranscript(threadId)) as TranscriptEntry[];
      setEntries(lines);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="conversation-panel">
      {error && <div className="error">{error}</div>}
      <ul className="transcript">
        {entries.map((e) => (
          <li key={e.messageId} className={`msg msg-${entryAuthor(e)}`}>
            <strong>{entryAuthor(e)}:</strong> {entryText(e)}
          </li>
        ))}
      </ul>
      <div className="composer">
        <textarea
          placeholder="message..."
          value={draft}
          onChange={(ev) => setDraft(ev.target.value)}
          rows={3}
        />
        <button type="button" onClick={send}>
          Send
        </button>
      </div>
    </div>
  );
}
