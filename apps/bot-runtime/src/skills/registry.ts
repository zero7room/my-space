/**
 * SkillRegistry: load `SKILL.md` frontmatter from `skills/public/` and
 * `skills/custom/`, validate against `skillManifestSchema`, and expose lookup.
 *
 * Frontmatter is YAML between `---` markers. We accept snake_case fields and
 * map to runtime camelCase.
 */
import * as fs from 'node:fs/promises';
import path from 'node:path';

import {
  type SkillManifest,
  type SkillsLoadError,
  skillManifestSchema,
} from '@ai-workflow/contracts';
import { parse as parseYaml } from 'yaml';

const FIELD_MAP: Record<string, keyof SkillManifest> = {
  when_to_use: 'whenToUse',
  allowed_tools: 'allowedTools',
  output_contract: 'outputContract',
  risk_class: 'riskClass',
};

export interface LoadResult {
  loaded: SkillManifest[];
  errors: SkillsLoadError[];
}

export class SkillRegistry {
  private byName = new Map<string, SkillManifest>();
  private errors: SkillsLoadError[] = [];

  async load(roots: string[]): Promise<LoadResult> {
    this.byName.clear();
    this.errors = [];
    for (const root of roots) {
      await this.scanDir(root);
    }
    return { loaded: [...this.byName.values()], errors: [...this.errors] };
  }

  lookup(name: string): SkillManifest | undefined {
    return this.byName.get(name);
  }

  list(): SkillManifest[] {
    return [...this.byName.values()];
  }

  loadStatus(): LoadResult {
    return { loaded: this.list(), errors: [...this.errors] };
  }

  private async scanDir(dir: string): Promise<void> {
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw err;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        await this.scanDir(p);
        continue;
      }
      if (e.isFile() && e.name === 'SKILL.md') {
        await this.loadFile(p);
      }
    }
  }

  private async loadFile(filePath: string): Promise<void> {
    let raw: string;
    try {
      raw = (await fs.readFile(filePath)).toString('utf8');
    } catch (err) {
      this.errors.push({
        kind: 'skills_load_error',
        skillPath: filePath,
        reason: (err as Error).message,
        field: null,
        at: new Date().toISOString(),
      });
      return;
    }
    const m = /^---\n([\s\S]*?)\n---/.exec(raw);
    if (!m) {
      this.errors.push({
        kind: 'skills_load_error',
        skillPath: filePath,
        reason: 'missing YAML frontmatter',
        field: null,
        at: new Date().toISOString(),
      });
      return;
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = parseYaml(m[1]!) as Record<string, unknown>;
    } catch (err) {
      this.errors.push({
        kind: 'skills_load_error',
        skillPath: filePath,
        reason: `YAML parse: ${(err as Error).message}`,
        field: null,
        at: new Date().toISOString(),
      });
      return;
    }
    const camel: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const mapped = FIELD_MAP[k] ?? (k as keyof SkillManifest);
      camel[mapped] = v;
    }
    const result = skillManifestSchema.safeParse(camel);
    if (!result.success) {
      const issue = result.error.issues[0];
      const camelField = issue?.path[0] as keyof SkillManifest | undefined;
      const snakeField = camelField
        ? Object.entries(FIELD_MAP).find(([, v]) => v === camelField)?.[0] ??
          camelField
        : null;
      this.errors.push({
        kind: 'skills_load_error',
        skillPath: filePath,
        reason: result.error.issues.map((i) => i.message).join('; '),
        field: snakeField as string | null,
        at: new Date().toISOString(),
      });
      return;
    }
    if (this.byName.has(result.data.name)) {
      this.errors.push({
        kind: 'skills_load_error',
        skillPath: filePath,
        reason: `duplicate skill name "${result.data.name}"`,
        field: 'name',
        at: new Date().toISOString(),
      });
      return;
    }
    this.byName.set(result.data.name, result.data);
  }
}
