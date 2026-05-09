import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

function resolveSource() {
  const source = process.env.OPENAPI_URL ?? "http://localhost:8000/openapi.json";

  if (source.startsWith("http://") || source.startsWith("https://")) {
    return source;
  }

  if (source.startsWith("file://")) {
    return new URL(source).pathname;
  }

  const path = resolve(source);
  if (!existsSync(path)) {
    throw new Error(`OpenAPI source not found: ${source}`);
  }

  return path;
}

const source = resolveSource();
const output = "lib/api/schema.ts";

execFileSync(
  "pnpm",
  [
    "exec",
    "openapi-typescript",
    source,
    "--output",
    output,
    "--root-types",
    "--export-type",
  ],
  {
    stdio: "inherit",
  },
);
