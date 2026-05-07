/**
 * Seed one dev user so the bearer token `dev-token` resolves. Writes directly
 * to the filesystem store — safe to run multiple times (idempotent upsert).
 *
 * Usage:
 *   node tooling/scripts/seed-dev-user.mjs
 *
 * Env:
 *   WORKSPACE_ROOT=./  (default: cwd)
 *   RUNTIME_ID=local-dev
 *   DEV_USER_ID=usr_dev000000000000000000   (21-char body)
 *   DEV_USER_NAME=Dev
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const WS = process.env.WORKSPACE_ROOT ?? process.cwd();
const RUNTIME_ID = process.env.RUNTIME_ID ?? 'local-dev';
const USER_ID = process.env.DEV_USER_ID ?? 'usr_dev00000000000000000';
const USER_NAME = process.env.DEV_USER_NAME ?? 'Dev';

if (!/^usr_[A-Za-z0-9]{21}$/.test(USER_ID)) {
  console.error(`DEV_USER_ID must match usr_<21 chars>; got ${USER_ID}`);
  process.exit(1);
}

const instanceRoot = path.join(WS, 'data', 'instances', RUNTIME_ID);
const usersDir = path.join(instanceRoot, 'state', 'users');
mkdirSync(usersDir, { recursive: true });

const file = path.join(usersDir, `${USER_ID}.json`);
const now = new Date().toISOString();
const existing = existsSync(file)
  ? JSON.parse(readFileSync(file, 'utf8'))
  : {};
const user = {
  id: USER_ID,
  displayName: USER_NAME,
  channelIdentities: { email: `${USER_NAME.toLowerCase()}@example.com` },
  createdAt: existing.createdAt ?? now,
  updatedAt: now,
};
writeFileSync(file, JSON.stringify(user));
console.log(`ok: seeded user ${USER_ID} at ${file}`);
console.log(`use bearer token: dev-token`);
console.log(`export:  LOCAL_USER_TOKENS="${USER_ID}:dev-token"`);
