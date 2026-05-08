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
import * as fs from 'node:fs/promises';
import path from 'node:path';

import { TokenAuthService, parseLocalUserTokens } from '../auth/user-token.js';
import { CriticalNodePolicyEngine } from '../critical-node/index.js';
import { RuntimeMetrics } from '../metrics/index.js';
import { RuntimePaths } from '../runtime/paths.js';
import { RecoveryScanner } from '../runtime/recovery.js';
import { AckSweeper, SseRegistry } from '../runtime/sse/index.js';
import { TaskIndex } from '../runtime/task-index.js';
import { DedupeReaper } from '../runtime/dedupe-reaper.js';
import { SkillRegistry } from '../skills/registry.js';
import {
  resolveChatModelAdapter,
  type ChatModelAdapter,
} from '../thread-loop/llm-factory.js';

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
  /** Optional test/production override for chat replies. */
  chatModel?: ChatModelAdapter;
}

export interface ServerHandle {
  app: FastifyInstance;
  rt: RuntimePaths;
  sse: SseRegistry;
  taskIndex: TaskIndex;
  policyEngine: CriticalNodePolicyEngine;
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

  const taskIndex = new TaskIndex(rt);
  await taskIndex.load();

  const tokenIndex = parseLocalUserTokens(cfg.localUserTokens);
  const auth = new TokenAuthService(tokenIndex, rt.users);

  // Skill registry — load from skills/public + skills/custom with cache fallback.
  const metrics = new RuntimeMetrics();
  const diagnosticsLog = path.join(rt.paths.diagnosticsRoot(), 'skills.jsonl');
  await fs.mkdir(rt.paths.diagnosticsRoot(), { recursive: true });
  const skillRegistry = new SkillRegistry(
    path.join(rt.paths.diagnosticsRoot(), 'skills-cache.json'),
    {
      onLoadError: (err) => {
        try {
          metrics.skillsLoadErrorTotal.inc({ errorClass: err.errorClass });
        } catch {
          /* best-effort */
        }
        void fs.appendFile(diagnosticsLog, JSON.stringify(err) + '\n').catch(() => {});
      },
      onFallback: (ev) => {
        try {
          metrics.skillsFallbackToCacheTotal.inc({ skillName: ev.skillName });
        } catch {
          /* best-effort */
        }
        void fs.appendFile(diagnosticsLog, JSON.stringify(ev) + '\n').catch(() => {});
      },
    },
  );
  await skillRegistry.load([rt.paths.skillsPublicRoot, rt.paths.skillsCustomRoot]);

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

  // Auth preHandler. Every route except /api/runtime/health,
  // /api/runtime/metrics (Prometheus scrape target) and the Feishu
  // webhook requires a valid bearer.
  app.addHook('preHandler', async (req, reply) => {
    const url = req.routeOptions.url ?? req.url;
    if (
      url === '/api/runtime/health' ||
      url === '/api/runtime/metrics' ||
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
  const chatModel = cfg.chatModel ?? resolveChatModelAdapter();

  registerThreadRoutes(app, { rt, sse, taskIndex, chatModel });
  registerTaskRoutes(app, { rt, sse, taskIndex });
  registerArtifactRoutes(app, { rt });
  registerChannelRoutes(app, { rt });
  // Shared CriticalNodePolicyEngine — kept in sync by the policies routes so
  // CRUD changes apply on the next tool dispatch without a restart (#12).
  const policyEngine = new CriticalNodePolicyEngine();
  policyEngine.setPolicies(await rt.policies.list());
  registerPolicyRoutes(app, { rt, engine: policyEngine });
  registerSkillRoutes(app, { rt, registry: skillRegistry });
  registerTeamRoutes(app, { rt, sse, taskIndex });

  const ackSweeper = new AckSweeper({ sse, intervalMs: 10_000, metrics });
  const dedupeReaper = new DedupeReaper({
    rt,
    intervalMs: 60 * 60 * 1000,
  });
  if (!cfg.skipLock) {
    ackSweeper.start();
    dedupeReaper.start();
  }

  return {
    app,
    rt,
    sse,
    taskIndex,
    policyEngine,
    lock,
    async close() {
      ackSweeper.stop();
      dedupeReaper.stop();
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
