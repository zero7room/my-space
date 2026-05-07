/**
 * Bearer-token auth for v1.
 *
 * Tokens map to `User` records via `LOCAL_USER_TOKENS` env in the form
 *   `userId1:token1,userId2:token2`
 *
 * In production this would back into a real session service; for v1 we keep the
 * in-memory map and never log raw tokens.
 */
import type { User } from '@ai-workflow/contracts';
import type { UserRepository } from '../runtime/repositories/index.js';

export interface UserTokenIndex {
  resolve(token: string): string | undefined;
  reverse(userId: string): string | undefined;
  size(): number;
  list(): { userId: string; tokenHint: string }[];
}

export function parseLocalUserTokens(envValue: string | undefined): UserTokenIndex {
  const map = new Map<string, string>(); // token → userId
  const reverse = new Map<string, string>(); // userId → token
  if (envValue) {
    for (const pair of envValue.split(',')) {
      const trimmed = pair.trim();
      if (!trimmed) continue;
      const sep = trimmed.indexOf(':');
      if (sep < 0) continue;
      const userId = trimmed.slice(0, sep).trim();
      const token = trimmed.slice(sep + 1).trim();
      if (!userId || !token) continue;
      map.set(token, userId);
      reverse.set(userId, token);
    }
  }
  return {
    resolve: (t) => map.get(t),
    reverse: (u) => reverse.get(u),
    size: () => map.size,
    list: () =>
      [...map.entries()].map(([token, userId]) => ({
        userId,
        tokenHint: tokenHint(token),
      })),
  };
}

/**
 * Returns a redacted preview suitable for logs (e.g. "dev-***ken"). Never log
 * raw tokens.
 */
export function tokenHint(token: string): string {
  if (token.length <= 6) return '*'.repeat(token.length);
  return `${token.slice(0, 3)}***${token.slice(-3)}`;
}

export interface AuthContext {
  user: User;
  tokenHint: string;
}

export class TokenAuthService {
  constructor(
    private readonly index: UserTokenIndex,
    private readonly users: UserRepository,
  ) {}

  async authenticate(headerValue?: string): Promise<AuthContext | undefined> {
    if (!headerValue) return undefined;
    const m = /^Bearer\s+(.+)$/i.exec(headerValue);
    if (!m) return undefined;
    const token = m[1]!.trim();
    const userId = this.index.resolve(token);
    if (!userId) return undefined;
    const user = await this.users.get(userId);
    if (!user) return undefined;
    return { user, tokenHint: tokenHint(token) };
  }
}
