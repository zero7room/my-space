import path from 'node:path';

interface WorkspaceRootEnv {
  cwd?: string;
  initCwd?: string;
}

export function resolveWorkspaceRoot(
  configuredRoot: string | undefined,
  env: WorkspaceRootEnv = {},
): string {
  const root = configuredRoot ?? process.cwd();
  if (path.isAbsolute(root)) return path.normalize(root);

  const base = env.initCwd ?? env.cwd ?? process.cwd();
  return path.resolve(base, root);
}
