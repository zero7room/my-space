import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAppContext } from "../app-context.js";
import { ConversationPanel } from "../components/conversation-panel.js";
import { useEventStream } from "../hooks/use-event-stream.js";

type Thread = { id: string; title: string; status: string };
type TaskSummary = { id: string; title: string; status: string };

export function ThreadDetail() {
  const { id } = useParams<{ id: string }>();
  const { client, adminToken } = useAppContext();
  const [thread, setThread] = useState<Thread | null>(null);
  const [tasks, setTasks] = useState<TaskSummary[]>([]);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    (async () => {
      const [t, ts] = await Promise.all([
        client.getThread(id) as Promise<Thread>,
        client.getTasks(id) as Promise<TaskSummary[]>,
      ]);
      if (!alive) return;
      setThread(t);
      setTasks(ts);
    })();
    return () => {
      alive = false;
    };
  }, [client, id]);

  const sseUrl = id ? `/api/threads/${id}/events?_token=${encodeURIComponent(adminToken)}` : "";
  useEventStream({ url: sseUrl });

  if (!thread) return <div>Loading...</div>;
  return (
    <div className="thread-detail">
      <div className="panel left">
        <h3>{thread.title}</h3>
        <p className="status">{thread.status}</p>
        {id && <ConversationPanel threadId={id} />}
      </div>
      <div className="panel center">
        <h4>Tasks</h4>
        <ul>
          {tasks.map((t) => (
            <li key={t.id}>
              {t.title} [{t.status}]
            </li>
          ))}
        </ul>
        <div>(Plan panel — Task 20)</div>
      </div>
      <div className="panel right">
        <h4>Artifacts</h4>
        <div>(Artifact panel — Task 21)</div>
      </div>
    </div>
  );
}
