export type CriterionId =
  | "C1"
  | "C2"
  | "C3"
  | "C4"
  | "C5"
  | "C6"
  | "C7"
  | "C8"
  | "C9"
  | "C10"
  | "C11"
  | "C12";

export type CriterionStatus = "pending" | "covered" | "covered-by-reference";

export type AcceptanceCriterion = {
  id: CriterionId;
  description: string;
  status: CriterionStatus;
  evidence: string[]; // file paths or test descriptions
};

const CRITERIA: AcceptanceCriterion[] = [
  {
    id: "C1",
    description: "User has continuous conversation in a thread",
    status: "pending",
    evidence: [],
  },
  {
    id: "C2",
    description: "System distinguishes new task from chit-chat",
    status: "pending",
    evidence: [],
  },
  {
    id: "C3",
    description: "System produces draft task and draft plan",
    status: "pending",
    evidence: [],
  },
  {
    id: "C4",
    description: "After confirmation, task enters TaskList",
    status: "pending",
    evidence: [],
  },
  {
    id: "C5",
    description: "Runtime starts executing the active task",
    status: "pending",
    evidence: [],
  },
  {
    id: "C6",
    description: "Client sees task status / plan steps / execution log / artifacts",
    status: "pending",
    evidence: [],
  },
  {
    id: "C7",
    description: "User mid-execution change generates plan revision",
    status: "pending",
    evidence: [],
  },
  {
    id: "C8",
    description: "After task completion, thread returns to chatting",
    status: "pending",
    evidence: [],
  },
  {
    id: "C9",
    description: "Restart preserves thread/task/plan/transcript/artifact",
    status: "pending",
    evidence: [],
  },
  {
    id: "C10",
    description: "Same webhook event_id deduplicates to one GuardDecision",
    status: "pending",
    evidence: [],
  },
  {
    id: "C11",
    description: "Crashed runtime recovers confirmed task within 60s",
    status: "pending",
    evidence: [],
  },
  {
    id: "C12",
    description: "CriticalNodePolicy applied without service restart",
    status: "pending",
    evidence: [],
  },
];

export function listCriteria(): AcceptanceCriterion[] {
  return CRITERIA.map((c) => ({ ...c, evidence: [...c.evidence] }));
}

export function recordCovered(id: CriterionId, evidence: string, byReference = false): void {
  const c = CRITERIA.find((x) => x.id === id);
  if (!c) throw new Error(`unknown criterion ${id}`);
  c.status = byReference ? "covered-by-reference" : "covered";
  if (!c.evidence.includes(evidence)) c.evidence.push(evidence);
}

export function resetForTests(): void {
  for (const c of CRITERIA) {
    c.status = "pending";
    c.evidence = [];
  }
}
