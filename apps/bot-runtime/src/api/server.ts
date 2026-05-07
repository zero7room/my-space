/**
 * Fastify server bootstrap for the bot runtime.
 *
 * Boot order:
 *   1. Acquire instance lock.
 *   2. Run RecoveryScanner.
 *   3. Register routes, auth, SSE.
 *
 * The server exposes the API surface frozen in `@ai-workflow/contracts/api`.
 * Cross-phase actions (task confirm/retry/etc.) write a control-signal record
 * and emit a `task_action_*` event so Phase 5 ThreadLoop can consume.
 */
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify';

import {
  acquireInstanceLock,
  releaseInstanceLock,
  type InstanceLockHolder,
} from '@ai-workflow/fs-store';

import { TokenAuthService, parseLocalUserTokens } from '../auth/user-token.js';
import { RuntimePaths } from '../runtime/paths.js';
import { RecoveryScanner } from '../runtime/recovery.js';
import { SseRegistry } from '../runtime/sse/index.js';

import { registerHealthRoutes } from './routes/health.js';
import { registerUserRoutes } from './routes/users.js';
import { registerThreadRoutes } from './routes/threads.js';
import { registerTaskRoutes } from './routes/tasks.js';
import { registerArtifactRoutes } from './routes/artifacts.js';
import { registerChannelRoutes } from './routes/channels.js';
import { registerPolicyRoutes } from './routes/policies.js';
import { registerSkillRoutes } from './routes/skills.js';
import { registerTeamRoutes } from './routes/teams.js';

export interface ServerConfig {
  workspaceRoot: string;
  runtimeId: string;
  port?: number;
  host?: string;
  localUserTokens?: string;
  /** Skip lock acquisition (useful for tests with multiple servers). */
  skipLock?: boolean;
}

export interface ServerHandle {
  app: FastifyInstance;
  rt: RuntimePaths;
  sse: SseRegistry;
  lock?: InstanceLockHolder;
  close(): Promise<void>;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: import('../auth/user-token.js').AuthContext;
  }
}

export async function createServer(cfg: ServerConfig): Promise<ServerHandle> {
  const rt = new RuntimePaths({
    workspaceRoot: cfg.workspaceRoot,
    runtimeId: cfg.runtimeId,
  });
  const sse = new SseRegistry();

  let lock: InstanceLockHolder | undefined;
  if (!cfg.skipLock) {
    lock = await acquireInstanceLock({
      lockPath: rt.paths.lockFile,
      runtimeId: cfg.runtimeId,
    });
  }

  // Run recovery on every boot. Errors bubble up and kill the process.
  await new RecoveryScanner({ paths: rt.paths }).run();

  const tokenIndex = parseLocalUserTokens(cfg.localUserTokens);
  const auth = new TokenAuthService(tokenIndex, rt.users);

  const app = Fastify({
    logger: {
      level: process.env['LOG_LEVEL'] ?? 'info',
      // Log redaction so we never leak Authorization header contents.
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
    disableRequestLogging: false,
    bodyLimit: 1024 * 1024,
  });

  // Mount @fastify/sensible for httpErrors helpers, /cors for client.
  await app.register((await import('@fastify/sensible')).default);
  await app.register((await import('@fastify/cors')).default, {
    origin: true,
  });

  // Auth preHandler. Every route except /api/runtime/health and the Feishu
  // webhook requires a valid bearer.
  app.addHook('preHandler', async (req, reply) => {
    const url = req.routeOptions.url ?? req.url;
    if (
      url === '/api/runtime/health' ||
      url === '/api/channels/feishu/webhook'
    ) {
      return;
    }
    const ctx = await auth.authenticate(req.headers.authorization);
    if (!ctx) {
      return reply.code(401).send({
        error: {
          code: 'unauthorized',
          message: 'missing or invalid bearer token',
        },
      });
    }
    req.auth = ctx;
  });

  registerHealthRoutes(app, { rt, lock, startedAt: new Date().toISOString() });
  registerUserRoutes(app);
  registerThreadRoutes(app, { rt, sse });
  registerTaskRoutes(app, { rt, sse });
  registerArtifactRoutes(app, { rt });
  registerChannelRoutes(app, { rt });
  registerPolicyRoutes(app, { rt });
  registerSkillRoutes(app, { rt });
  registerTeamRoutes(app, { rt });

  return {
    app,
    rt,
    sse,
    lock,
    async close() {
      await app.close();
      if (lock) {
        await releaseInstanceLock(rt.paths.lockFile);
      }
    },
  };
}

/** Helper used by routes for owner-first checks. */
export function ensureOwner(
  req: FastifyRequest,
  ownerUserId: string,
  reply: FastifyReply,
): boolean {
  if (!req.auth || req.auth.user.id !== ownerUserId) {
    reply.code(403).send({
      error: { code: 'forbidden', message: 'owner-only action' },
    });
    return false;
  }
  return true;
}
