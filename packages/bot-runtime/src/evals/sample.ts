import { readFile } from "node:fs/promises";
import { z } from "zod";

export function createSampleSchema<I extends z.ZodTypeAny, E extends z.ZodTypeAny>(
  input: I,
  expected: E,
) {
  return z.object({
    id: z.string(),
    description: z.string().optional(),
    input,
    expected,
    tags: z.array(z.string()).optional(),
  });
}

export type EvalSample<I, E> = {
  id: string;
  description?: string | undefined;
  input: I;
  expected: E;
  tags?: string[] | undefined;
};

export async function loadSamples<I, E>(
  file: string,
  // biome-ignore lint/suspicious/noExplicitAny: Necessary to work around Zod typing constraints
  schema: z.ZodType<EvalSample<I, E>, any, any>,
): Promise<EvalSample<I, E>[]> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    return [];
  }
  const out: EvalSample<I, E>[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parsed = schema.parse(JSON.parse(trimmed));
    out.push(parsed);
  }
  return out;
}
