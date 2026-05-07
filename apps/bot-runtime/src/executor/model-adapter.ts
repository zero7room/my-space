/**
 * ModelAdapter is a thin abstraction over a structured-output LLM call. The
 * executor uses it to ask "given task + plan + context, what tool should I
 * call next?" and gets back a typed proposal. v1 ships a deterministic
 * scripted adapter that runs from a queue — used by tests and as a fallback
 * for evals. Real LLM adapters slot in alongside.
 */

export interface ToolProposal {
  toolName: string;
  toolArgs: Record<string, unknown>;
  rationale: string;
  /** Optional skill name running this call (for CriticalNodePolicy lookup). */
  skillName?: string;
}

export interface ModelInput {
  taskTitle: string;
  taskDescription: string;
  planObjective: string;
  recentEvents: string[];
}

export interface ModelAdapter {
  proposeTool(input: ModelInput): Promise<ToolProposal | { kind: 'finish' } | { kind: 'ask'; question: string }>;
}

/**
 * Adapter that emits a fixed sequence of proposals. Used by tests + bootstrap.
 */
export class ScriptedAdapter implements ModelAdapter {
  private cursor = 0;
  constructor(
    private readonly script: (
      | ToolProposal
      | { kind: 'finish' }
      | { kind: 'ask'; question: string }
    )[],
  ) {}
  async proposeTool(): Promise<
    ToolProposal | { kind: 'finish' } | { kind: 'ask'; question: string }
  > {
    const next = this.script[this.cursor++];
    if (!next) return { kind: 'finish' };
    return next;
  }
}
