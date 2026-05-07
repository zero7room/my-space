/**
 * Tool registry + built-in tools. Tools are typed handlers invoked by the
 * Executor between model calls. Each tool declares:
 *   - name (canonical, snake_case)
 *   - input zod schema
 *   - handler (gets a `ToolContext` with safe paths + repos)
 *   - idempotency class: pure | idempotent | non_idempotent
 *   - filesystem write hint (used by CriticalNodePolicy filesystem matcher).
 *
 * Filesystem tools constrain writes to `tasks/<taskId>/user-data/workspace/`
 * and `outputs/`. Path traversal attempts surface as a tool error.
 */
import { z } from 'zod';
import * as fs from 'node:fs/promises';
import path from 'node:path';

import {
  ensureDir,
  safeRelativePath,
  PathOutsideRootError,
} from '@ai-workflow/fs-store';
import type { Task } from '@ai-workflow/contracts';

import type { RuntimePaths } from '../runtime/paths.js';

export type ToolIdempotency = 'pure' | 'idempotent' | 'non_idempotent';

export interface ToolContext {
  rt: RuntimePaths;
  task: Task;
  threadId: string;
}

export interface ToolDefinition<I = unknown, O = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<I>;
  handler: (ctx: ToolContext, input: I) => Promise<O>;
  idempotency: ToolIdempotency;
  filesystemWrite?: 'workspace' | 'outputs';
  /** Tools tagged team-internal are not invokable from a top-level Executor. */
  teamInternal?: boolean;
  /** Tools tagged team-lead-only are gated to lead Executors. */
  teamLeadOnly?: boolean;
}

// ---------- Filesystem-safe path resolver ----------------------------------

function workspaceRoot(ctx: ToolContext): string {
  return ctx.rt.paths.taskWorkspace(ctx.threadId, ctx.task.id);
}
function outputsRoot(ctx: ToolContext): string {
  return ctx.rt.paths.taskOutputs(ctx.threadId, ctx.task.id);
}

function resolveScoped(
  ctx: ToolContext,
  scope: 'workspace' | 'outputs',
  rel: string,
): string {
  const base = scope === 'workspace' ? workspaceRoot(ctx) : outputsRoot(ctx);
  return safeRelativePath(base, rel);
}

// ---------- Built-in tools -------------------------------------------------

export const readFileTool: ToolDefinition<
  { scope: 'workspace' | 'outputs'; path: string },
  { contents: string }
> = {
  name: 'read_file',
  description: 'Read a UTF-8 file from workspace or outputs',
  idempotency: 'pure',
  inputSchema: z
    .object({
      scope: z.enum(['workspace', 'outputs']),
      path: z.string().min(1),
    })
    .strict(),
  handler: async (ctx, input) => {
    const abs = resolveScoped(ctx, input.scope, input.path);
    const buf = await fs.readFile(abs);
    return { contents: buf.toString('utf8') };
  },
};

export const writeFileTool: ToolDefinition<
  { scope: 'workspace' | 'outputs'; path: string; contents: string },
  { bytesWritten: number }
> = {
  name: 'write_file',
  description: 'Write a file under workspace or outputs (path-safe)',
  idempotency: 'idempotent',
  filesystemWrite: 'outputs',
  inputSchema: z
    .object({
      scope: z.enum(['workspace', 'outputs']),
      path: z.string().min(1),
      contents: z.string(),
    })
    .strict(),
  handler: async (ctx, input) => {
    const abs = resolveScoped(ctx, input.scope, input.path);
    await ensureDir(path.dirname(abs));
    await fs.writeFile(abs, input.contents);
    return { bytesWritten: Buffer.byteLength(input.contents) };
  },
};

export const listDirTool: ToolDefinition<
  { scope: 'workspace' | 'outputs'; path?: string },
  { entries: string[] }
> = {
  name: 'list_dir',
  description: 'List entries in a workspace or outputs subdirectory',
  idempotency: 'pure',
  inputSchema: z
    .object({
      scope: z.enum(['workspace', 'outputs']),
      path: z.string().optional(),
    })
    .strict(),
  handler: async (ctx, input) => {
    const abs = resolveScoped(ctx, input.scope, input.path ?? '.');
    try {
      const entries = await fs.readdir(abs);
      return { entries: entries.sort() };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { entries: [] };
      throw err;
    }
  },
};

export const strReplaceTool: ToolDefinition<
  {
    scope: 'workspace' | 'outputs';
    path: string;
    search: string;
    replace: string;
  },
  { replacements: number }
> = {
  name: 'str_replace',
  description: 'Replace one occurrence of a string in a file',
  idempotency: 'non_idempotent',
  filesystemWrite: 'outputs',
  inputSchema: z
    .object({
      scope: z.enum(['workspace', 'outputs']),
      path: z.string().min(1),
      search: z.string().min(1),
      replace: z.string(),
    })
    .strict(),
  handler: async (ctx, input) => {
    const abs = resolveScoped(ctx, input.scope, input.path);
    const buf = await fs.readFile(abs);
    const original = buf.toString('utf8');
    const idx = original.indexOf(input.search);
    if (idx < 0) throw new Error(`search string not found in ${input.path}`);
    const next =
      original.slice(0, idx) + input.replace + original.slice(idx + input.search.length);
    await fs.writeFile(abs, next);
    return { replacements: 1 };
  },
};

export const askClarificationTool: ToolDefinition<
  { question: string },
  { ack: true }
> = {
  name: 'ask_clarification',
  description:
    "Block the task with reason='awaiting_user_action' and surface a question",
  idempotency: 'idempotent',
  inputSchema: z.object({ question: z.string().min(1) }).strict(),
  handler: async () => ({ ack: true }),
};

export const presentFilesTool: ToolDefinition<
  { paths: string[] },
  { count: number }
> = {
  name: 'present_files',
  description: 'Surface produced files to the user',
  idempotency: 'idempotent',
  inputSchema: z.object({ paths: z.array(z.string().min(1)) }).strict(),
  handler: async (_ctx, input) => ({ count: input.paths.length }),
};

// ---------- Registry ------------------------------------------------------

export class ToolRegistry {
  private readonly byName = new Map<string, ToolDefinition<unknown, unknown>>();

  register<I, O>(tool: ToolDefinition<I, O>): void {
    if (this.byName.has(tool.name)) {
      throw new Error(`tool already registered: ${tool.name}`);
    }
    this.byName.set(tool.name, tool as ToolDefinition<unknown, unknown>);
  }

  list(): ToolDefinition<unknown, unknown>[] {
    return [...this.byName.values()];
  }

  get(name: string): ToolDefinition<unknown, unknown> | undefined {
    return this.byName.get(name);
  }

  /**
   * Validate input then call the tool. Translates path-traversal errors into
   * a typed error.
   */
  async invoke<O = unknown>(
    name: string,
    ctx: ToolContext,
    rawInput: unknown,
  ): Promise<O> {
    const tool = this.byName.get(name);
    if (!tool) throw new Error(`unknown tool: ${name}`);
    const parsed = tool.inputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new Error(
        `invalid input for ${name}: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
      );
    }
    try {
      return (await tool.handler(ctx, parsed.data)) as O;
    } catch (err) {
      if (err instanceof PathOutsideRootError) {
        throw new Error(
          `permission_error: tool ${name} attempted to write outside scoped root: ${err.message}`,
        );
      }
      throw err;
    }
  }
}

export function createDefaultRegistry(): ToolRegistry {
  const r = new ToolRegistry();
  r.register(readFileTool);
  r.register(writeFileTool);
  r.register(listDirTool);
  r.register(strReplaceTool);
  r.register(askClarificationTool);
  r.register(presentFilesTool);
  return r;
}
