/**
 * SkillRegistry: load `SKILL.md` frontmatter from `skills/public/` and
 * `skills/custom/`, validate against `skillManifestSchema`, and expose lookup.
 *
 * Frontmatter is YAML between `---` markers. We accept snake_case fields and
 * map to runtime camelCase.
 *
 * Per-acceptance #56:
 *   - Per-file isolation: a single skill failure NEVER blocks another skill.
 *   - Each failure emits `skills_load_error{skillName, errorClass, ...}` and
 *     bumps `skills_load_error_total{errorClass}`.
 *   - Consecutive N=5 failures of the SAME skill (keyed by folder name) trigger
 *     fallback to the on-disk cache. Counter is persisted in the cache file
 *     itself, reset on the next successful load. The fallback emits
 *     `skills_fallback_to_cache{skillName, cacheTimestamp}` and bumps
 *     `skills_fallback_to_cache_total{skillName}`.
 *   - The cache lives at `state/_diagnostics/skills-cache.json`.
 *   - Normal path always prefers disk; cache is purely a startup safety net.
 *   - `loadStatus()` returns each known skill plus its `source` ('disk' |
 *     'cache' | 'failed'), powering `GET /api/skills/load-status`.
 */
import * as fs from 'node:fs/promises';
import path from 'node:path';

import {
  type SkillLoadErrorClass,
  type SkillManifest,
  type SkillsFallbackToCache,
  type SkillsLoadError,
  skillManifestSchema,
} from '@ai-workflow/contracts';
import { atomicWriteJson, readJson } from '@ai-workflow/fs-store';
import { parse as parseYaml } from 'yaml';

const FIELD_MAP: Record<string, keyof SkillManifest> = {
  when_to_use: 'whenToUse',
  allowed_tools: 'allowedTools',
  output_contract: 'outputContract',
  risk_class: 'riskClass',
};

export const FALLBACK_THRESHOLD = 5;

export type SkillSource = 'disk' | 'cache' | 'failed';

export interface SkillStatus {
  skillName: string;
  source: SkillSource;
  skillPath?: string;
  cacheTimestamp?: string;
  consecutiveFailures?: number;
}

export interface LoadResult {
  loaded: SkillManifest[];
  errors: SkillsLoadError[];
  fellBackTo: string[];
  fallbackEvents: SkillsFallbackToCache[];
  statuses: SkillStatus[];
}

interface CachedEntry {
  manifest: SkillManifest;
  /** Folder name (basename of dir containing SKILL.md). Used to key counters. */
  folderKey: string;
  /** ISO timestamp when this entry was last written to cache from a good load. */
  cachedAt: string;
  /** Consecutive failures of the SAME folder since last successful load. */
  consecutiveFailures: number;
}

interface CacheFile {
  /** Map keyed by folderKey. */
  entries: Record<string, CachedEntry>;
}

export interface SkillRegistryHooks {
  onLoadError?: (err: SkillsLoadError) => void;
  onFallback?: (ev: SkillsFallbackToCache) => void;
}

export class SkillRegistry {
  private byName = new Map<string, SkillManifest>();
  /** Per-skill source tracking (keyed by skill name). */
  private sourceByName = new Map<string, SkillSource>();
  /** Errors collected this load(). */
  private errors: SkillsLoadError[] = [];
  /** Names that fell back to cache this load(). */
  private fellBackTo: string[] = [];
  /** Fallback events emitted this load(). */
  private fallbackEvents: SkillsFallbackToCache[] = [];
  /** Path → folder key (basename of dir). Cached per loadFile call. */
  private folderKeyByPath = new Map<string, string>();

  constructor(
    private readonly cachePath?: string,
    private readonly hooks: SkillRegistryHooks = {},
  ) {}

  async load(roots: string[]): Promise<LoadResult> {
    this.byName.clear();
    this.sourceByName.clear();
    this.errors = [];
    this.fellBackTo = [];
    this.fallbackEvents = [];
    this.folderKeyByPath.clear();

    // Read existing cache (if any) up front. We need it both for fallback
    // resolution AND for tracking consecutive failure counts.
    const cache = await this.readCache();

    for (const root of roots) {
      await this.scanDir(root);
    }

    // Mark loaded-from-disk skills.
    for (const name of this.byName.keys()) {
      this.sourceByName.set(name, 'disk');
    }

    // For each error, increment that folder's consecutiveFailures. Only when
    // the threshold is reached do we fall back to cache. Below the threshold
    // the skill is reported as 'failed' (no cache substitution).
    if (this.cachePath) {
      const updatedCache: CacheFile = { entries: { ...cache.entries } };
      for (const err of this.errors) {
        const folderKey = this.folderKeyByPath.get(err.skillPath)
          ?? path.basename(path.dirname(err.skillPath));
        const prior = updatedCache.entries[folderKey];
        if (prior) {
          prior.consecutiveFailures = (prior.consecutiveFailures ?? 0) + 1;
          if (
            prior.consecutiveFailures >= FALLBACK_THRESHOLD
            && !this.byName.has(prior.manifest.name)
          ) {
            this.byName.set(prior.manifest.name, prior.manifest);
            this.sourceByName.set(prior.manifest.name, 'cache');
            this.fellBackTo.push(prior.manifest.name);
            const ev: SkillsFallbackToCache = {
              kind: 'skills_fallback_to_cache',
              skillName: prior.manifest.name,
              cacheTimestamp: prior.cachedAt,
              at: new Date().toISOString(),
            };
            this.fallbackEvents.push(ev);
            this.hooks.onFallback?.(ev);
          }
        }
        // For errored skills not yet in byName (no fallback yet), we still
        // surface them as 'failed' in loadStatus via err.skillName (if known).
        if (err.skillName && !this.sourceByName.has(err.skillName)) {
          this.sourceByName.set(err.skillName, 'failed');
        }
      }

      // Reset consecutive failure counters for skills that loaded successfully
      // from disk this boot, and refresh their cached snapshot.
      const now = new Date().toISOString();
      for (const [name, manifest] of this.byName) {
        if (this.sourceByName.get(name) !== 'disk') continue;
        // Find folderKey by reverse-looking the path map. Fall back to name.
        let folderKey: string | undefined;
        for (const [p, k] of this.folderKeyByPath) {
          if (path.basename(path.dirname(p)) && this.byName.get(name) === manifest) {
            folderKey = k;
            // Prefer the entry whose cached manifest name matches.
            if (cache.entries[k]?.manifest.name === name) break;
          }
        }
        folderKey = folderKey ?? name;
        updatedCache.entries[folderKey] = {
          manifest,
          folderKey,
          cachedAt: now,
          consecutiveFailures: 0,
        };
      }

      try {
        await atomicWriteJson(this.cachePath, updatedCache);
      } catch {
        /* best-effort */
      }
    }

    return {
      loaded: [...this.byName.values()],
      errors: [...this.errors],
      fellBackTo: [...this.fellBackTo],
      fallbackEvents: [...this.fallbackEvents],
      statuses: this.computeStatuses(),
    };
  }

  lookup(name: string): SkillManifest | undefined {
    return this.byName.get(name);
  }

  list(): SkillManifest[] {
    return [...this.byName.values()];
  }

  loadStatus(): LoadResult {
    return {
      loaded: this.list(),
      errors: [...this.errors],
      fellBackTo: [...this.fellBackTo],
      fallbackEvents: [...this.fallbackEvents],
      statuses: this.computeStatuses(),
    };
  }

  private computeStatuses(): SkillStatus[] {
    const out: SkillStatus[] = [];
    for (const [name, source] of this.sourceByName) {
      out.push({ skillName: name, source });
    }
    return out;
  }

  private async readCache(): Promise<CacheFile> {
    if (!this.cachePath) return { entries: {} };
    const raw = await readJson<CacheFile | Record<string, SkillManifest>>(
      this.cachePath,
    );
    if (!raw) return { entries: {} };
    // Backwards compat: previous format was a flat Record<folder, manifest>.
    if ('entries' in raw && typeof raw.entries === 'object') {
      return raw as CacheFile;
    }
    const entries: Record<string, CachedEntry> = {};
    for (const [k, m] of Object.entries(raw as Record<string, SkillManifest>)) {
      entries[k] = {
        manifest: m,
        folderKey: k,
        cachedAt: new Date().toISOString(),
        consecutiveFailures: 0,
      };
    }
    return { entries };
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
        // PER-FILE ISOLATION: any unexpected throw is caught so neighbouring
        // skills still load. Acceptance #56.
        try {
          await this.loadFile(p);
        } catch (err) {
          this.recordError({
            kind: 'skills_load_error',
            skillName: null,
            skillPath: p,
            errorClass: 'schema_invalid',
            reason: `unexpected: ${(err as Error).message}`,
            field: null,
            at: new Date().toISOString(),
          });
        }
      }
    }
  }

  private async loadFile(filePath: string): Promise<void> {
    const folderKey = path.basename(path.dirname(filePath));
    this.folderKeyByPath.set(filePath, folderKey);

    let raw: string;
    try {
      raw = (await fs.readFile(filePath)).toString('utf8');
    } catch (err) {
      this.recordError({
        kind: 'skills_load_error',
        skillName: null,
        skillPath: filePath,
        errorClass: 'yaml_parse',
        reason: (err as Error).message,
        field: null,
        at: new Date().toISOString(),
      });
      return;
    }
    const m = /^---\n([\s\S]*?)\n---/.exec(raw);
    if (!m) {
      this.recordError({
        kind: 'skills_load_error',
        skillName: null,
        skillPath: filePath,
        errorClass: 'yaml_parse',
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
      this.recordError({
        kind: 'skills_load_error',
        skillName: null,
        skillPath: filePath,
        errorClass: 'yaml_parse',
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
      const declaredName =
        typeof parsed['name'] === 'string' ? (parsed['name'] as string) : null;
      this.recordError({
        kind: 'skills_load_error',
        skillName: declaredName,
        skillPath: filePath,
        errorClass: 'schema_invalid',
        reason: result.error.issues.map((i) => i.message).join('; '),
        field: snakeField as string | null,
        at: new Date().toISOString(),
      });
      return;
    }
    if (this.byName.has(result.data.name)) {
      this.recordError({
        kind: 'skills_load_error',
        skillName: result.data.name,
        skillPath: filePath,
        errorClass: 'name_conflict',
        reason: `duplicate skill name "${result.data.name}"`,
        field: 'name',
        at: new Date().toISOString(),
      });
      return;
    }
    this.byName.set(result.data.name, result.data);
  }

  private recordError(err: SkillsLoadError): void {
    this.errors.push(err);
    this.hooks.onLoadError?.(err);
  }
}

/** Exported for tests / metric label enumeration. */
export const SKILL_LOAD_ERROR_CLASSES: SkillLoadErrorClass[] = [
  'schema_invalid',
  'yaml_parse',
  'name_conflict',
];
