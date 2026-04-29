import { useCallback, useEffect, useState } from "react";
import { useAppContext } from "../app-context.js";

type Task = {
  id: string;
  threadId: string;
  title: string;
  description: string;
  status: string;
};
type PlanStep = { id: string; title: string; status: string };
type Plan = { id: string; objective: string; steps: PlanStep[] };

export function TaskPlanPanel({ taskId, threadId }: { taskId: string; threadId: string }) {
  const { client } = useAppContext();
  const [task, setTask] = useState<Task | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const t = (await client.getTask(taskId)) as Task;
      setTask(t);
      try {
        const p = (await client.getPlan(taskId)) as Plan;
        setPlan(p);
      } catch {
        setPlan(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [client, taskId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function onConfirm() {
    try {
      await client.confirmTask(taskId, { threadId, fromUserId: "u_client" });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  async function onCancel() {
    try {
      await client.cancelTask(taskId, { threadId, fromUserId: "u_client" });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (error) return <div className="error">{error}</div>;
  if (!task) return <div>Loading task...</div>;
  return (
    <div className="task-plan-panel">
      <h3>{task.title}</h3>
      <p className="status">[{task.status}]</p>
      <p>{task.description}</p>
      {(task.status === "draft" || task.status === "confirmed") && (
        <div className="actions">
          <button type="button" onClick={onConfirm}>
            Confirm
          </button>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      )}
      {plan && (
        <div className="plan">
          <h4>Plan: {plan.objective}</h4>
          <ol>
            {plan.steps.map((s) => (
              <li key={s.id}>
                {s.title} <em>[{s.status}]</em>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
