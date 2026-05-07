import { describe, it, expect } from 'vitest';

import {
  TASK_TRANSITIONS,
  PLAN_TRANSITIONS,
  TEAM_WORK_ITEM_TRANSITIONS,
  transitionTask,
  transitionPlan,
  transitionTeamWorkItem,
  type TaskState,
  type PlanState,
  type TeamWorkItemState,
} from '../states.js';
import {
  applyTaskTransition,
  canTransitionTask,
  canTransitionTeam,
  canTransitionTeammate,
  canTransitionWorkItem,
} from '../schemas.js';
import { newTaskId, newThreadId, newUserId } from '../ids.js';

const ALL_TASK_STATES: TaskState[] = [
  'draft',
  'confirmed',
  'queued',
  'running',
  'awaiting_critical_node',
  'blocked',
  'paused',
  'changing',
  'completed',
  'failed',
  'cancelled',
];

describe('Task state machine', () => {
  it('allows every legal edge declared in TASK_TRANSITIONS', () => {
    for (const from of ALL_TASK_STATES) {
      for (const to of TASK_TRANSITIONS[from]) {
        expect(transitionTask(from, to).ok, `${from}→${to}`).toBe(true);
      }
    }
  });

  it('rejects illegal jumps', () => {
    expect(transitionTask('completed', 'running').ok).toBe(false);
    expect(transitionTask('cancelled', 'queued').ok).toBe(false);
  });

  it('rejects self-transitions on every state', () => {
    for (const s of ALL_TASK_STATES) {
      expect(transitionTask(s, s).ok).toBe(false);
    }
  });

  it('canTransitionTask gates failed→queued behind retry/manual/plan-update flags', () => {
    expect(canTransitionTask('failed', 'queued').ok).toBe(false);
    expect(canTransitionTask('failed', 'queued', { autoRetry: true }).ok).toBe(true);
    expect(canTransitionTask('failed', 'queued', { manualRetry: true }).ok).toBe(true);
    expect(
      canTransitionTask('failed', 'queued', { planUpdateReset: true }).ok,
    ).toBe(true);
  });

  it('canTransitionTask requires blockedReason for blocked / failed', () => {
    expect(canTransitionTask('running', 'blocked').ok).toBe(false);
    expect(
      canTransitionTask('running', 'blocked', {
        blockedReason: 'awaiting_user_action',
      }).ok,
    ).toBe(true);
  });

  it('applyTaskTransition stamps blockedReason and updatedAt', () => {
    const now = new Date('2026-05-06T00:00:00.000Z').toISOString();
    const t = applyTaskTransition(
      {
        id: newTaskId(),
        threadId: newThreadId(),
        ownerUserId: newUserId(),
        title: 't',
        description: '',
        status: 'running',
        sourceMessageIds: [],
        artifactIds: [],
        changeRecordIds: [],
        archivedRevisionIds: [],
        schemaVersion: 2,
        createdAt: now,
        updatedAt: now,
      },
      'blocked',
      { blockedReason: 'awaiting_user_action', now },
    );
    expect(t.status).toBe('blocked');
    expect(t.blockedReason).toBe('awaiting_user_action');
    expect(t.updatedAt).toBe(now);
  });
});

describe('Plan state machine', () => {
  const ALL: PlanState[] = [
    'draft',
    'pending_confirmation',
    'active',
    'revising',
    'superseded',
    'completed',
  ];

  it('rejects self-transitions', () => {
    for (const s of ALL) expect(transitionPlan(s, s).ok).toBe(false);
  });

  it('allows declared edges and rejects others', () => {
    for (const from of ALL) {
      for (const to of ALL) {
        const allowed = PLAN_TRANSITIONS[from].includes(to) && from !== to;
        expect(transitionPlan(from, to).ok, `${from}→${to}`).toBe(allowed);
      }
    }
  });
});

describe('TeamWorkItem state machine uses "completed" not "done"', () => {
  const ALL: TeamWorkItemState[] = [
    'available',
    'claimed',
    'completed',
    'failed',
    'cancelled',
  ];

  it('allows declared edges including claimed→completed', () => {
    expect(transitionTeamWorkItem('claimed', 'completed').ok).toBe(true);
    expect(transitionTeamWorkItem('available', 'claimed').ok).toBe(true);
    expect(transitionTeamWorkItem('claimed', 'available').ok).toBe(true);
  });

  it('rejects done as a terminal state (it does not exist)', () => {
    // Compile-time guard: TeamWorkItemState union does not include "done".
    // Here we ensure runtime rejects it too.
    expect(
      transitionTeamWorkItem(
        'claimed',
        'done' as unknown as TeamWorkItemState,
      ).ok,
    ).toBe(false);
  });

  it('matches table for every pair', () => {
    for (const from of ALL) {
      for (const to of ALL) {
        const allowed =
          TEAM_WORK_ITEM_TRANSITIONS[from].includes(to) && from !== to;
        expect(canTransitionWorkItem(from, to).ok, `${from}→${to}`).toBe(
          allowed,
        );
      }
    }
  });
});

describe('Team / Teammate guards reject self-transitions', () => {
  it('Team', () => {
    expect(canTransitionTeam('active', 'active').ok).toBe(false);
    expect(canTransitionTeam('active', 'finishing').ok).toBe(true);
    expect(canTransitionTeam('completed', 'active').ok).toBe(false);
  });

  it('Teammate', () => {
    expect(canTransitionTeammate('working', 'idle').ok).toBe(true);
    expect(canTransitionTeammate('finished', 'working').ok).toBe(false);
  });
});
