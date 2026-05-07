import 'dotenv/config';

import { createServer } from './api/server.js';
import { resolveWorkspaceRoot } from './config.js';

async function main(): Promise<void> {
  const port = Number.parseInt(process.env['PORT'] ?? '4000', 10);
  const host = process.env['HOST'] ?? '0.0.0.0';
  const runtimeId = process.env['RUNTIME_ID'] ?? 'default';
  const workspaceRoot = resolveWorkspaceRoot(process.env['WORKSPACE_ROOT'], {
    cwd: process.cwd(),
    initCwd: process.env['INIT_CWD'],
  });
  const localUserTokens = process.env['LOCAL_USER_TOKENS'];

  const handle = await createServer({
    workspaceRoot,
    runtimeId,
    port,
    host,
    localUserTokens,
  });

  await handle.app.listen({ port, host });
  console.log(`bot-runtime listening on ${host}:${port} (runtimeId=${runtimeId})`);

  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.once(sig, async () => {
      console.log(`\nbot-runtime: ${sig} received, shutting down`);
      await handle.close();
      process.exit(0);
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
