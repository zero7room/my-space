import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { SkillRegistry } from '../registry.js';

function tmp(): string {
  return mkdtempSync(path.join(tmpdir(), 'skills-'));
}

function seedSkill(root: string, dir: string, contents: string): string {
  const fullDir = path.join(root, dir);
  mkdirSync(fullDir, { recursive: true });
  writeFileSync(path.join(fullDir, 'SKILL.md'), contents);
  return fullDir;
}

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
  });

  it('records skills_load_error for missing frontmatter', async () => {
    const root = tmp();
    seedSkill(root, 'public/bad', '# no frontmatter\n');
    const reg = new SkillRegistry();
    const out = await reg.load([path.join(root, 'public')]);
    expect(out.loaded).toHaveLength(0);
    expect(out.errors[0]?.reason).toMatch(/missing YAML frontmatter/);
  });

  it('records error with snake_case field on validation failure', async () => {
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
  });

  it('rejects duplicate names', async () => {
    const root = tmp();
    const body = (n: string) => `---
name: ${n}
description: x
when_to_use: y
allowed_tools: []
agent: x
version: 0.1.0
risk_class: low
---
`;
    seedSkill(root, 'public/a', body('twin'));
    seedSkill(root, 'public/b', body('twin'));
    const reg = new SkillRegistry();
    const out = await reg.load([path.join(root, 'public')]);
    expect(out.loaded).toHaveLength(1);
    expect(out.errors[0]?.reason).toMatch(/duplicate skill name/);
  });
});
