import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

export async function appendJsonl(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const line = `${JSON.stringify(value)}\n`;
  await appendFile(file, line, { encoding: "utf8" });
}

export async function readJsonl<T = unknown>(file: string): Promise<T[]> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const out: T[] = [];
  for (const line of raw.split("\n")) {
    if (line.trim() === "") continue;
    out.push(JSON.parse(line) as T);
  }
  return out;
}

export async function tailJsonl<T = unknown>(file: string, n: number): Promise<T[]> {
  const all = await readJsonl<T>(file);
  return all.slice(Math.max(0, all.length - n));
}
