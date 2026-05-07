import { describe, it, expect } from 'vitest';

import {
  artifactRecordSchema,
  changeRecordSchema,
  skillManifestSchema,
  taskListSchema,
  taskRetryStateSchema,
  taskSchema,
  teamSchema,
  teamMessageSchema,
  teamRosterSlotSchema,
  teamWorkItemSchema,
  teammateSchema,
} from '../schemas.js';
import {
  newArtifactId,
  newChangeRecordId,
  newGuardDecisionId,
  newMessageId,
  newPlanId,
  newPlanRevisionId,
  newTaskId,
  newTaskListId,
  newTeamId,
  newTeammateId,
  newThreadId,
  newUserId,
  newWorkItemId,
} from '../ids.js';

const NOW = '2026-05-06T00:00:00.000Z';

describe('TaskList schema', () => {
  it('accepts a minimal valid TaskList', () => {
    const ok = taskListSchema.safeParse({
      id: newTaskListId(),
      threadId: newThreadId(),
      orderedTaskIds: [],
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(ok.success).toBe(true);
  });

  it('rejects missing required fields', () => {
    for (const drop of ['id', 'threadId', 'orderedTaskIds', 'createdAt', 'updatedAt']) {
      const sample: Record<string, unknown> = {
        id: newTaskListId(),
        threadId: newThreadId(),
        orderedTaskIds: [],
        createdAt: NOW,
        updatedAt: NOW,
      };
      delete sample[drop];
      expect(
        taskListSchema.safeParse(sample).success,
        `missing ${drop}`,
      ).toBe(false);
    }
  });
});

describe('ChangeRecord schema', () => {
  const sample = () => ({
    id: newChangeRecordId(),
    taskId: newTaskId(),
    oldPlanRevisionId: newPlanRevisionId(),
    newPlanRevisionId: newPlanRevisionId(),
    triggerMessageId: newMessageId(),
    triggerUserId: newUserId(),
    guardDecisionId: newGuardDecisionId(),
    userOriginalText: 'hi',
    llmSummary: 'summary',
    archivedArtifactPaths: [],
    createdAt: NOW,
  });

  it('valid', () => {
    expect(changeRecordSchema.safeParse(sample()).success).toBe(true);
  });

  it('rejects each missing required field', () => {
    for (const k of [
      'id',
      'taskId',
      'oldPlanRevisionId',
      'newPlanRevisionId',
      'triggerMessageId',
      'triggerUserId',
      'guardDecisionId',
      'userOriginalText',
      'llmSummary',
      'archivedArtifactPaths',
      'createdAt',
    ]) {
      const s: Record<string, unknown> = sample();
      delete s[k];
      expect(changeRecordSchema.safeParse(s).success, `missing ${k}`).toBe(false);
    }
  });
});

describe('ArtifactRecord schema', () => {
  const sample = () => ({
    id: newArtifactId(),
    taskId: newTaskId(),
    planRevisionId: newPlanRevisionId(),
    relativePath: 'outputs/foo.txt',
    sizeBytes: 12,
    mimeType: 'text/plain',
    sha256: 'a'.repeat(64),
    status: 'active' as const,
    createdAt: NOW,
    updatedAt: NOW,
  });

  it('valid', () => {
    expect(artifactRecordSchema.safeParse(sample()).success).toBe(true);
  });

  it('rejects bad sha256 length', () => {
    const s = sample();
    s.sha256 = 'ab';
    expect(artifactRecordSchema.safeParse(s).success).toBe(false);
  });

  it('rejects status enum out of range', () => {
    const s = { ...sample(), status: 'pending' };
    expect(artifactRecordSchema.safeParse(s).success).toBe(false);
  });
});

describe('SkillManifest schema', () => {
  const sample = () => ({
    name: 'sample-skill',
    description: 'a sample',
    whenToUse: 'when sample is needed',
    allowedTools: [],
    agent: 'researcher',
    version: '0.1.0',
    riskClass: 'low' as const,
  });

  it('valid', () => {
    expect(skillManifestSchema.safeParse(sample()).success).toBe(true);
  });

  it('rejects description over 200 chars', () => {
    const s = { ...sample(), description: 'x'.repeat(201) };
    expect(skillManifestSchema.safeParse(s).success).toBe(false);
  });

  it('rejects bad riskClass', () => {
    const s = { ...sample(), riskClass: 'critical' };
    expect(skillManifestSchema.safeParse(s).success).toBe(false);
  });

  it('rejects bad version', () => {
    const s = { ...sample(), version: 'v1' };
    expect(skillManifestSchema.safeParse(s).success).toBe(false);
  });
});

describe('Task schema and TaskRetryState', () => {
  it('blocked status without blockedReason fails refine', () => {
    const t = {
      id: newTaskId(),
      threadId: newThreadId(),
      ownerUserId: newUserId(),
      title: 't',
      description: '',
      status: 'blocked' as const,
      sourceMessageIds: [],
      artifactIds: [],
      changeRecordIds: [],
      archivedRevisionIds: [],
      schemaVersion: 2 as const,
      createdAt: NOW,
      updatedAt: NOW,
    };
    expect(taskSchema.safeParse(t).success).toBe(false);
  });

  it('confirmedByUserId mismatch fails refine', () => {
    const owner = newUserId();
    const other = newUserId();
    const t = {
      id: newTaskId(),
      threadId: newThreadId(),
      ownerUserId: owner,
      confirmedByUserId: other,
      title: 't',
      description: '',
      status: 'confirmed' as const,
      sourceMessageIds: [],
      artifactIds: [],
      changeRecordIds: [],
      archivedRevisionIds: [],
      schemaVersion: 2 as const,
      createdAt: NOW,
      updatedAt: NOW,
    };
    expect(taskSchema.safeParse(t).success).toBe(false);
  });

  it.each([
    'transient_error',
    'assertion_error',
    'permission_error',
    'user_cancelled',
    'budget_overflow',
  ])('TaskRetryState accepts failureClass=%s', (cls) => {
    expect(
      taskRetryStateSchema.safeParse({
        attemptCount: 0,
        maxRetries: 2,
        failureClass: cls,
      }).success,
    ).toBe(true);
  });

  it('TaskRetryState rejects negative attemptCount', () => {
    expect(
      taskRetryStateSchema.safeParse({ attemptCount: -1, maxRetries: 2 })
        .success,
    ).toBe(false);
  });

  it('TaskRetryState rejects attemptCount > maxRetries + 1', () => {
    expect(
      taskRetryStateSchema.safeParse({ attemptCount: 5, maxRetries: 2 }).success,
    ).toBe(false);
  });

  it('TaskRetryState rejects bogus failureClass', () => {
    expect(
      taskRetryStateSchema.safeParse({
        attemptCount: 0,
        maxRetries: 2,
        failureClass: 'oops',
      }).success,
    ).toBe(false);
  });
});

describe('Team-family schemas', () => {
  const slot = () => ({
    slotId: newWorkItemId(), // any valid id; prefix is not enforced at schema layer
    slotName: 'researcher',
    maxConcurrentClaims: 1,
    status: 'pending' as const,
  });

  const team = () => ({
    id: newTeamId(),
    parentTaskId: newTaskId(),
    parentExecutorId: newTeammateId(),
    threadId: newThreadId(),
    status: 'forming' as const,
    roster: [slot()],
    budget: {
      maxDurationMs: 3_600_000,
      maxTokens: 100_000,
      maxTeammates: 4,
      maxWorkItems: 32,
      maxMessages: 200,
    },
    schemaVersion: 1 as const,
    createdAt: NOW,
    updatedAt: NOW,
  });

  it('Team valid', () => {
    expect(teamSchema.safeParse(team()).success).toBe(true);
  });

  it('Team rejects budget over hard cap maxTeammates=8', () => {
    const t = team();
    t.budget.maxTeammates = 9;
    expect(teamSchema.safeParse(t).success).toBe(false);
  });

  it('TeamRosterSlot valid', () => {
    expect(teamRosterSlotSchema.safeParse(slot()).success).toBe(true);
  });

  it('TeamWorkItem rejects "done" status', () => {
    const wi = {
      id: newWorkItemId(),
      teamId: newTeamId(),
      description: '',
      priority: 0,
      status: 'done' as unknown as 'completed',
      attemptCount: 0,
      maxReclaims: 2,
      createdAt: NOW,
      updatedAt: NOW,
    };
    expect(teamWorkItemSchema.safeParse(wi).success).toBe(false);
  });

  it('TeamMessage accepts {teammateId} object form', () => {
    const m = {
      id: newMessageId(),
      teamId: newTeamId(),
      from: { teammateId: newTeammateId() },
      to: 'broadcast' as const,
      kind: 'chat' as const,
      content: 'hello',
      at: NOW,
    };
    expect(teamMessageSchema.safeParse(m).success).toBe(true);
  });

  it('Teammate rejects missing budget', () => {
    const m = {
      id: newTeammateId(),
      teamId: newTeamId(),
      slotId: newWorkItemId(),
      runtimeActorId: newTeammateId(),
      status: 'idle' as const,
      schemaVersion: 1 as const,
      createdAt: NOW,
      updatedAt: NOW,
    };
    expect(teammateSchema.safeParse(m).success).toBe(false);
  });
});

// touch the imports to keep tsc happy if the variables are unused above.
void newPlanId;
