import { useEffect, useState } from "react";
import { useAppContext } from "../app-context.js";

type Artifact = { name: string; sizeBytes: number; modifiedAt: string };

export function ArtifactPanel({ taskId, threadId }: { taskId: string; threadId: string }) {
  const { client } = useAppContext();
  const [list, setList] = useState<Artifact[]>([]);
  const [selected, setSelected] = useState<{ name: string; content: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const items = (await client.getArtifacts(taskId, threadId)) as Artifact[];
        if (alive) setList(items);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [client, taskId, threadId]);

  async function open(name: string) {
    try {
      const c = await client.getArtifact(taskId, threadId, name);
      setSelected({ name, content: typeof c === "string" ? c : JSON.stringify(c) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="artifact-panel">
      {error && <div className="error">{error}</div>}
      <ul>
        {list.map((a) => (
          <li key={a.name}>
            <button type="button" onClick={() => open(a.name)}>
              {a.name}
            </button>{" "}
            <small>({a.sizeBytes} bytes)</small>
          </li>
        ))}
      </ul>
      {selected && (
        <div className="artifact-viewer">
          <h5>{selected.name}</h5>
          <pre>{selected.content}</pre>
        </div>
      )}
    </div>
  );
}
