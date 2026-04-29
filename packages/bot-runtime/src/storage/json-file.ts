import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp.${process.pid}.${Date.now()}`;
  const text = JSON.stringify(value, null, 2);
  await writeFile(tmp, text, "utf8");
  await rename(tmp, file);
}

export async function readJson<T = unknown>(file: string): Promise<T | null> {
  try {
    const raw = await readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}
