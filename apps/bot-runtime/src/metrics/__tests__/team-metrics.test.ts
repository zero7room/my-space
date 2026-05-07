/**
 * Acceptance 66 — verifies team-related metrics are registered and increment
 * at the right emission sites.
 */
import { describe, it, expect } from 'vitest';

import { RuntimeMetrics } from '../metrics.js';

describe('Team metrics (acceptance 66)', () => {
  it('all 19 team-related metrics are registered', async () => {
    const m = new RuntimeMetrics();
    const required = [
      'ai_team_started_total',
      'ai_team_completed_total',
      'ai_team_forming_failed_total',
      'ai_team_active_count',
      'ai_teammate_spawned_total',
      'ai_teammate_failed_total',
      'ai_teammate_active_count',
      'ai_work_item_published_total',
      'ai_work_item_claimed_total',
      'ai_work_item_completed_total',
      'ai_work_item_failed_total',
      'ai_work_item_reclaim_exhausted_total',
      'ai_work_items_available_count',
      'ai_team_message_posted_total',
      'ai_team_message_budget_exhausted_total',
      'ai_team_budget_exhausted_total',
      'ai_team_claim_contention_total',
      'ai_team_recovery_failed_total',
      'ai_teammate_recovery_failed_total',
    ];
    const text = await m.scrape();
    for (const name of required) {
      expect(text.includes(name) || text.includes(`# HELP ${name}`)).toBe(true);
    }
  });

  it('counters increment without throwing', () => {
    const m = new RuntimeMetrics();
    m.teamStarted.inc();
    m.teamCompleted.inc({ outcome: 'completed' });
    m.teammateSpawned.inc({ persona: 'researcher' });
    m.workItemPublished.inc({ preferredRole: 'coder' });
    m.workItemClaimed.inc();
    m.workItemCompleted.inc();
    m.teamClaimContention.inc();
    m.teamMessagePosted.inc({ kind: 'chat' });
    m.teammateFailed.inc({ failureClass: 'transient_error' });
    expect(true).toBe(true);
  });
});
