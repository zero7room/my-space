import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { SkillRegistry, FALLBACK_THRESHOLD } from '../registry.js';
import { CriticalNodePolicyEngine } from '../../critical-node/index.js';

function tmp(): string {
  return mkdtempSync(path.join(tmpdir(), 'skills-'));
}

function seedSkill(root: string, dir: string, contents: string): string {
  const fullDir = path.join(root, dir);
  mkdirSync(fullDir, { recursive: true });
  writeFileSync(path.join(fullDir, 'SKILL.md'), contents);
  return fullDir;
}

const validBody = (n: string, riskClass = 'low'): string => `---
name: ${n}
description: x
when_to_use: y
allowed_tools: []
agent: x
version: 0.1.0
risk_class: ${riskClass}
---
`;

describe('SkillRegistry', () => {
  it('parses snake_case frontmatter into camelCase manifest', async () => {
    const root = tmp();
    seedSkill(
      root,
      'public/researcher',
      `---
name: researcher
description: investigates a topic
when_to_use: when research is needed
allowed_tools:
  - read_file
  - list_dir
agent: researcher
version: 0.1.0
risk_class: low
---

# Body
`,
    );
    const reg = new SkillRegistry();
    const out = await reg.load([path.join(root, 'public')]);
    expect(out.errors).toHaveLength(0);
    expect(out.loaded[0]?.name).toBe('researcher');
    expect(out.loaded[0]?.whenToUse).toBe('when research is needed');
    expect(out.loaded[0]?.allowedTools).toEqual(['read_file', 'list_dir']);
    expect(out.statuses[0]).toMatchObject({ skillName: 'researcher', source: 'disk' });
  });

  it('records skills_load_error with errorClass=yaml_parse for missing frontmatter', async () => {
    const root = tmp();
    seedSkill(root, 'public/bad', '# no frontmatter\n');
    const reg = new SkillRegistry();
    const out = await reg.load([path.join(root, 'public')]);
    expect(out.loaded).toHaveLength(0);
    expect(out.errors[0]?.errorClass).toBe('yaml_parse');
    expect(out.errors[0]?.reason).toMatch(/missing YAML frontmatter/);
  });

  it('records error with snake_case field + errorClass=schema_invalid on validation failure', async () => {
    const root = tmp();
    seedSkill(
      root,
      'public/bad-version',
      `---
name: bad-version
description: x
when_to_use: y
allowed_tools: []
agent: x
version: not-semver
risk_class: low
---
`,
    );
    const reg = new SkillRegistry();
    const out = await reg.load([path.join(root, 'public')]);
    expect(out.loaded).toHaveLength(0);
    expect(out.errors[0]?.field).toBe('version');
    expect(out.errors[0]?.errorClass).toBe('schema_invalid');
    expect(out.errors[0]?.skillName).toBe('bad-version');
  });

  it('rejects duplicate names with errorClass=name_conflict', async () => {
    const root = tmp();
    seedSkill(root, 'public/a', validBody('twin'));
    seedSkill(root, 'public/b', validBody('twin'));
    const reg = new SkillRegistry();
    const out = await reg.load([path.join(root, 'public')]);
    expect(out.loaded).toHaveLength(1);
    expect(out.errors[0]?.reason).toMatch(/duplicate skill name/);
    expect(out.errors[0]?.errorClass).toBe('name_conflict');
  });

  // Acceptance #56 — per-file isolation.
  it('per-file isolation: bad skill does not block sibling skill', async () => {
    const root = tmp();
    seedSkill(root, 'public/good', validBody('good'));
    seedSkill(
      root,
      'public/bad',
      `---\nname: bad\ndescription: x\nwhen_to_use: y\nallowed_tools: []\nagent: x\nversion: not-semver\nrisk_class: low\n---\n`,
    );
    const reg = new SkillRegistry();
    const out = await reg.load([path.join(root, 'public')]);
    expect(out.loaded.map((s) => s.name)).toContain('good');
    expect(out.errors).toHaveLength(1);
    expect(out.statuses.find((s) => s.skillName === 'good')?.source).toBe('disk');
  });

  // Acceptance #56 — N=5 consecutive failures → fallback.
  it('falls back to cache only after N=5 consecutive failures of same skill', async () => {
    const root = tmp();
    const cache = path.join(root, 'skills-cache.json');
    // First a successful load to seed the cache.
    const dir = seedSkill(root, 'public/flaky', validBody('flaky'));
    const reg1 = new SkillRegistry(cache);
    const ok = await reg1.load([path.join(root, 'public')]);
    expect(ok.loaded.map((s) => s.name)).toEqual(['flaky']);
    // Corrupt the SKILL.md so subsequent boots fail with schema_invalid.
    writeFileSync(
      path.join(dir, 'SKILL.md'),
      `---\nname: flaky\ndescription: x\nwhen_to_use: y\nallowed_tools: []\nagent: x\nversion: not-semver\nrisk_class: low\n---\n`,
    );

    // Boots 1..(N-1): no fallback, status=failed.
    for (let i = 1; i < FALLBACK_THRESHOLD; i++) {
      const r = new SkillRegistry(cache);
      const out = await r.load([path.join(root, 'public')]);
      expect(out.fellBackTo).toEqual([]);
      expect(out.loaded).toEqual([]);
      expect(out.statuses.find((s) => s.skillName === 'flaky')?.source).toBe('failed');
    }

    // Boot N: fallback fires.
    const reg2 = new SkillRegistry(cache);
    const out = await reg2.load([path.join(root, 'public')]);
    expect(out.fellBackTo).toEqual(['flaky']);
    expect(out.loaded.map((s) => s.name)).toEqual(['flaky']);
    expect(out.fallbackEvents).toHaveLength(1);
    expect(out.fallbackEvents[0]).toMatchObject({
      kind: 'skills_fallback_to_cache',
      skillName: 'flaky',
    });
    expect(out.fallbackEvents[0]?.cacheTimestamp).toMatch(/^\d{4}-/);
    expect(out.statuses.find((s) => s.skillName === 'flaky')?.source).toBe('cache');
  });

  it('cache absent + load fails → status=failed, no fallback', async () => {
    const root = tmp();
    const cache = path.join(root, 'skills-cache.json');
    seedSkill(
      root,
      'public/bad',
      `---\nname: bad\ndescription: x\nwhen_to_use: y\nallowed_tools: []\nagent: x\nversion: not-semver\nrisk_class: low\n---\n`,
    );
    const reg = new SkillRegistry(cache);
    const out = await reg.load([path.join(root, 'public')]);
    expect(out.loaded).toEqual([]);
    expect(out.fellBackTo).toEqual([]);
    expect(out.statuses[0]).toMatchObject({ skillName: 'bad', source: 'failed' });
  });

  it('disk skill present → uses disk even if cache also has it', async () => {
    const root = tmp();
    const cache = path.join(root, 'skills-cache.json');
    seedSkill(root, 'public/x', validBody('x'));
    const reg1 = new SkillRegistry(cache);
    await reg1.load([path.join(root, 'public')]);
    // Cache file now has 'x'. Re-load with disk still present.
    const reg2 = new SkillRegistry(cache);
    const out = await reg2.load([path.join(root, 'public')]);
    expect(out.statuses[0]).toMatchObject({ skillName: 'x', source: 'disk' });
    expect(out.fellBackTo).toEqual([]);
  });

  it('hooks fire onLoadError for each failure and onFallback when threshold hit', async () => {
    const root = tmp();
    const cache = path.join(root, 'skills-cache.json');
    const dir = seedSkill(root, 'public/h', validBody('h'));
    let errors = 0;
    let fallbacks = 0;
    await new SkillRegistry(cache).load([path.join(root, 'public')]);
    writeFileSync(
      path.join(dir, 'SKILL.md'),
      `---\nname: h\ndescription: x\nwhen_to_use: y\nallowed_tools: []\nagent: x\nversion: not-semver\nrisk_class: low\n---\n`,
    );
    for (let i = 0; i < FALLBACK_THRESHOLD; i++) {
      const reg = new SkillRegistry(cache, {
        onLoadError: () => errors++,
        onFallback: () => fallbacks++,
      });
      await reg.load([path.join(root, 'public')]);
    }
    expect(errors).toBe(FALLBACK_THRESHOLD);
    expect(fallbacks).toBe(1);
  });

  it('successful disk load resets the consecutive failure counter', async () => {
    const root = tmp();
    const cache = path.join(root, 'skills-cache.json');
    const dir = seedSkill(root, 'public/r', validBody('r'));
    await new SkillRegistry(cache).load([path.join(root, 'public')]);
    // 3 failures (under threshold)
    writeFileSync(
      path.join(dir, 'SKILL.md'),
      `---\nname: r\ndescription: x\nwhen_to_use: y\nallowed_tools: []\nagent: x\nversion: not-semver\nrisk_class: low\n---\n`,
    );
    for (let i = 0; i < 3; i++) {
      await new SkillRegistry(cache).load([path.join(root, 'public')]);
    }
    // Restore good content
    writeFileSync(path.join(dir, 'SKILL.md'), validBody('r'));
    await new SkillRegistry(cache).load([path.join(root, 'public')]);
    // Re-corrupt and verify no premature fallback (counter was reset).
    writeFileSync(
      path.join(dir, 'SKILL.md'),
      `---\nname: r\ndescription: x\nwhen_to_use: y\nallowed_tools: []\nagent: x\nversion: not-semver\nrisk_class: low\n---\n`,
    );
    const out = await new SkillRegistry(cache).load([path.join(root, 'public')]);
    expect(out.fellBackTo).toEqual([]);
    // Confirm cache file persists in expected shape.
    const persisted = JSON.parse(readFileSync(cache, 'utf8'));
    expect(persisted.entries).toBeDefined();
  });
});

describe('SkillRegistry + CriticalNodePolicyEngine integration (acceptance #13)', () => {
  it('high-risk skill triggers built-in critical node policy require_approval', async () => {
    const root = tmp();
    seedSkill(root, 'public/danger', validBody('danger', 'high'));
    const reg = new SkillRegistry();
    await reg.load([path.join(root, 'public')]);
    const engine = new CriticalNodePolicyEngine();
    const decision = engine.evaluate({ toolName: 'rm', skillName: 'danger' }, reg);
    expect(decision.action).toBe('require_approval');
    expect(decision.matched.some((m) => m.matcher.kind === 'skill')).toBe(true);
  });

  it('low-risk skill does not trigger built-in high-risk policy', async () => {
    const root = tmp();
    seedSkill(root, 'public/safe', validBody('safe', 'low'));
    const reg = new SkillRegistry();
    await reg.load([path.join(root, 'public')]);
    const engine = new CriticalNodePolicyEngine();
    const decision = engine.evaluate({ toolName: 'rm', skillName: 'safe' }, reg);
    expect(decision.action).toBe('log_only');
  });
});
