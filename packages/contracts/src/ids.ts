/**
 * ID prefixes and factories.
 *
 * Format: `${prefix}_${nanoid(21)}`.
 *
 * Prefixes must stay stable — they show up in durable JSON files, URLs, and
 * logs. Do not rename.
 */
import { customAlphabet } from 'nanoid';

// 21-char alphanumeric body; nanoid default alphabet is url-safe but we strip
// `-` and `_` to keep IDs free of characters that need escaping in path
// segments or regex.
const ID_ALPHABET =
  '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const nano = customAlphabet(ID_ALPHABET, 21);

export const ID_PREFIXES = {
  runtime: 'rt',
  thread: 'th',
  task: 'ta',
  plan: 'pl',
  artifact: 'ar',
  channelBinding: 'cb',
  outboundJob: 'oj',
  chatClaim: 'cc',
  transaction: 'tx',
  event: 'ev',
  team: 'tm',
  teammate: 'te',
  workItem: 'wi',
  message: 'ms',
  subagent: 'sa',
  skill: 'sk',
  actor: 'act',
  lease: 'lease',
  planRevision: 'pr',
  changeRecord: 'chg',
  user: 'usr',
  taskList: 'tl',
  guardDecision: 'gd',
  policy: 'pol',
  job: 'job',
  channelEvent: 'che',
} as const;

export type IdPrefix = keyof typeof ID_PREFIXES;

/** Generic id factory. */
export function newId(prefix: IdPrefix): string {
  return `${ID_PREFIXES[prefix]}_${nano()}`;
}

/** Parse an id and return its prefix, or null if invalid. */
export function idPrefix(id: string): string | null {
  const match = /^([a-z]+)_([A-Za-z0-9]{21})$/.exec(id);
  return match ? match[1]! : null;
}

/** True if the id looks like `prefix_<21 chars>`. */
export function isId(id: unknown, prefix?: IdPrefix): id is string {
  if (typeof id !== 'string') return false;
  const m = /^([a-z]+)_([A-Za-z0-9]{21})$/.exec(id);
  if (!m) return false;
  if (prefix !== undefined) return m[1] === ID_PREFIXES[prefix];
  return true;
}

// Per-prefix convenience factories (keeps call sites self-documenting).
export const newRuntimeId = () => newId('runtime');
export const newThreadId = () => newId('thread');
export const newTaskId = () => newId('task');
export const newTaskListId = () => newId('taskList');
export const newPlanId = () => newId('plan');
export const newPlanRevisionId = () => newId('planRevision');
export const newArtifactId = () => newId('artifact');
export const newBindingId = () => newId('channelBinding');
export const newJobId = () => newId('job');
export const newOutboundJobId = () => newId('outboundJob');
export const newTransactionId = () => newId('transaction');
export const newEventId = () => newId('event');
export const newTeamId = () => newId('team');
export const newTeammateId = () => newId('teammate');
export const newWorkItemId = () => newId('workItem');
export const newMessageId = () => newId('message');
export const newSubagentId = () => newId('subagent');
export const newSkillRegId = () => newId('skill');
export const newActorId = () => newId('actor');
export const newLeaseId = () => newId('lease');
export const newChangeRecordId = () => newId('changeRecord');
export const newUserId = () => newId('user');
export const newGuardDecisionId = () => newId('guardDecision');
export const newPolicyId = () => newId('policy');
export const newChannelEventId = () => newId('channelEvent');

/**
 * RuntimeId string validator. Unlike the prefixed IDs above, runtimeId is
 * operator-assigned (used as a directory name under `data/instances/`), so
 * plan Step 1 pins the regex.
 */
export const RUNTIME_ID_REGEX = /^[a-z0-9][a-z0-9-]{0,62}$/;

export function isValidRuntimeId(id: string): boolean {
  return RUNTIME_ID_REGEX.test(id);
}
