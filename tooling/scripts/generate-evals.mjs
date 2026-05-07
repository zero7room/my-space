/**
 * Generate synthetic eval datasets. Runs at build time for the v1 eval
 * harness. Produces ~40/20/20/42/40 sample datasets derived from rule
 * classifier + known plan-revision trajectories. These exercise the harness
 * end-to-end and make the threshold checks meaningful.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const CLIENT = {
  source: 'client',
  bound: true,
  isOwner: true,
  hasPendingConfirmation: false,
};

function mgRows() {
  const rows = [];
  const slash = [
    ['/confirm', 'confirm_task'],
    ['/yes', 'confirm_task'],
    ['/cancel', 'cancel_task'],
    ['/pause', 'pause_task'],
    ['/resume', 'resume_task'],
    ['/status', 'progress_query'],
  ];
  for (const [text, intent] of slash) {
    rows.push({
      id: `mg-slash-${text}`,
      input: { ...CLIENT, text, hasPendingConfirmation: intent === 'confirm_task' },
      label: intent,
    });
  }
  const chats = [
    'draft a Q3 marketing plan',
    'help me brainstorm a launch',
    'let us discuss the roadmap',
    'what is our strategy here',
    'please summarize the meeting',
    'share the latest notes',
    'quick thought on the brief',
    'thanks for the context',
    'good morning',
    'ping when ready',
  ];
  for (let i = 0; i < chats.length; i++) {
    rows.push({ id: `mg-chat-${i}`, input: { ...CLIENT, text: chats[i] }, label: 'chat' });
  }
  const groupUnbound = [
    'standup at 11',
    'pizza friday',
    'team lunch tomorrow',
    'random group chatter',
    'anyone seen the keys',
    'project alpha recap',
    'sprint demo at 3',
    'share of voice update',
  ];
  for (let i = 0; i < groupUnbound.length; i++) {
    rows.push({
      id: `mg-irrelevant-${i}`,
      input: {
        source: 'lark_group',
        bound: false,
        isOwner: false,
        hasPendingConfirmation: false,
        text: groupUnbound[i],
      },
      label: 'irrelevant',
    });
  }
  const boundGroupNotAddressed = [
    'fyi team — no bot here',
    'just chatting among humans',
    'ok see you later',
  ];
  for (let i = 0; i < boundGroupNotAddressed.length; i++) {
    rows.push({
      id: `mg-bound-ignored-${i}`,
      input: {
        source: 'lark_group',
        bound: true,
        isOwner: false,
        hasPendingConfirmation: false,
        text: boundGroupNotAddressed[i],
      },
      label: 'irrelevant',
    });
  }
  const mention = [
    '@bot update the plan',
    '@bot please run the report',
    '@bot schedule the job',
  ];
  for (let i = 0; i < mention.length; i++) {
    rows.push({
      id: `mg-mention-${i}`,
      input: {
        source: 'lark_group',
        bound: true,
        isOwner: true,
        hasPendingConfirmation: false,
        text: mention[i],
        mentionedBot: true,
      },
      label: 'chat',
    });
  }
  return rows;
}

function tcRows() {
  const rows = [];
  for (let i = 0; i < 10; i++) {
    rows.push({ id: `tc-owner-${i}`, input: { isOwner: true, text: '/confirm' }, label: 'confirmed' });
  }
  for (let i = 0; i < 10; i++) {
    rows.push({ id: `tc-nonowner-${i}`, input: { isOwner: false, text: '/confirm' }, label: 'rejected' });
  }
  return rows;
}

function prRows() {
  const rows = [];
  const scenarios = [
    { oldHas: true, failed: false, label: 'archive_artifacts_and_change_record' },
    { oldHas: false, failed: true, label: 'reset_retry_state' },
    { oldHas: true, failed: true, label: 'archive_and_reset' },
    { oldHas: false, failed: false, label: 'archive_artifacts_and_change_record' },
  ];
  for (let i = 0; i < 5; i++) {
    for (const s of scenarios) {
      rows.push({
        id: `pr-${i}-${s.label}`,
        input: { oldRevisionHasArtifacts: s.oldHas, taskFailed: s.failed },
        label: s.label,
      });
    }
  }
  return rows;
}

function fcRows() {
  const rows = [];
  const samples = [
    { msg: 'ETIMEDOUT upstream socket', label: 'transient_error' },
    { msg: 'ECONNRESET reading response', label: 'transient_error' },
    { msg: '503 Service Unavailable', label: 'transient_error' },
    { msg: '504 Gateway Timeout', label: 'transient_error' },
    { msg: 'EAI_AGAIN dns lookup', label: 'transient_error' },
    { msg: 'connection reset by peer', label: 'transient_error' },
    { msg: 'assertion failed: expected 3 got 2', label: 'assertion_error' },
    { msg: 'test expectation mismatch', label: 'assertion_error' },
    { msg: 'invariant violated: state missing', label: 'assertion_error' },
    { msg: 'permission denied writing file', label: 'permission_error' },
    { msg: 'forbidden: not owner', label: 'permission_error' },
    { msg: 'access denied to /etc/passwd', label: 'permission_error' },
    { msg: 'permission_error: tool tried to escape root', label: 'permission_error' },
    { msg: 'user cancelled by signal', label: 'user_cancelled' },
  ];
  for (let copy = 0; copy < 3; copy++) {
    for (let i = 0; i < samples.length; i++) {
      rows.push({ id: `fc-${copy}-${i}`, input: { message: samples[i].msg }, label: samples[i].label });
    }
  }
  return rows;
}

function toRows() {
  const rows = [];
  const orchestrations = [
    { desc: 'tiny read-file edit', label: 'direct' },
    { desc: 'answer a factoid', label: 'direct' },
    { desc: 'single str_replace fix', label: 'direct' },
    { desc: 'one-off write_file', label: 'direct' },
    { desc: 'kick off a quick research spike', label: 'subagent' },
    { desc: 'crawl a website for data', label: 'subagent' },
    { desc: 'fuzz a specific function', label: 'subagent' },
    { desc: 'build feature with researcher + coder-1 + reviewer', label: 'team' },
    { desc: 'parallelize data collection with 4 workers', label: 'team' },
    { desc: 'author + editor + fact-checker pipeline', label: 'team' },
  ];
  for (let copy = 0; copy < 4; copy++) {
    for (let i = 0; i < orchestrations.length; i++) {
      rows.push({ id: `to-${copy}-${i}`, input: { description: orchestrations[i].desc }, label: orchestrations[i].label });
    }
  }
  return rows;
}

function writeJsonl(pathOut, rows) {
  mkdirSync(path.dirname(pathOut), { recursive: true });
  writeFileSync(pathOut, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
}

const ROOT = path.resolve(process.cwd(), 'tests/evals/datasets');
writeJsonl(path.join(ROOT, 'message-guard.jsonl'), mgRows());
writeJsonl(path.join(ROOT, 'task-confirmation.jsonl'), tcRows());
writeJsonl(path.join(ROOT, 'plan-revision.jsonl'), prRows());
writeJsonl(path.join(ROOT, 'failure-class.jsonl'), fcRows());
writeJsonl(path.join(ROOT, 'team-orchestration.jsonl'), toRows());

console.log(`ok: generated eval datasets into ${ROOT}`);
