import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAppContext } from "../app-context.js";

type ThreadSummary = { id: string; title: string; status: string };

export function ThreadList() {
  const { client } = useAppContext();
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = (await client.getThreads()) as ThreadSummary[];
        if (alive) setThreads(list);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [client]);

  if (error) return <div className="error">Error: {error}</div>;
  return (
    <div className="thread-list">
      <h2>Threads</h2>
      <ul>
        {threads.map((t) => (
          <li key={t.id}>
            <Link to={`/threads/${t.id}`}>
              {t.title} <span className="status">[{t.status}]</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
