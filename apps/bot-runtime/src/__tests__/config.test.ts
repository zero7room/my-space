import { describe, expect, it } from 'vitest';

import { resolveWorkspaceRoot } from '../config.js';

describe('runtime config', () => {
  it('resolves relative workspace roots from the pnpm invocation directory', () => {
    expect(
      resolveWorkspaceRoot('./', {
        cwd: '/repo/apps/bot-runtime',
        initCwd: '/repo',
      }),
    ).toBe('/repo');
  });
});
