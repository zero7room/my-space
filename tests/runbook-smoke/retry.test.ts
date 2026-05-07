import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('retry-troubleshooting runbook structure', () => {
  const md = fs.readFileSync(
    path.join(__dirname, '../../docs/runbooks/retry-troubleshooting.md'),
    'utf8',
  );

  it.each([
    'retry 风暴',
    'lock stale 累积',
    'schema migration 失败',
    'classification 误判风暴',
    'kill-9 retry recovery',
  ])('contains SOP: %s', (title) => {
    expect(md).toContain(title);
  });

  it('every SOP has the 5 mandated subsections', () => {
    const sections = md.split(/^## SOP-/m).slice(1);
    expect(sections.length).toBeGreaterThanOrEqual(5);
    for (const section of sections) {
      expect(section).toMatch(/### Signal/);
      expect(section).toMatch(/### Hypothesis/);
      expect(section).toMatch(/### Diagnose/);
      expect(section).toMatch(/### Mitigate/);
      expect(section).toMatch(/### Escalation/);
    }
  });

  it('grafana retry dashboard JSON is well-formed and tagged', () => {
    const raw = fs.readFileSync(
      path.join(__dirname, '../../ops/grafana/retry-dashboard.json'),
      'utf8',
    );
    const parsed = JSON.parse(raw);
    expect(parsed.title).toBe('Retry & Recovery');
    expect(parsed.tags).toEqual(expect.arrayContaining(['retry', 'ai-workflow', 'oncall']));
    expect(Array.isArray(parsed.panels)).toBe(true);
    // 5 row headers + 10 data panels = 15
    expect(parsed.panels.length).toBeGreaterThanOrEqual(15);
  });
});
